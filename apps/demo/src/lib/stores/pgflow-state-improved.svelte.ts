import type { FlowRun, PgflowClient } from '@pgflow/client';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import { SvelteDate } from 'svelte/reactivity';

interface FlowEvent {
	event_type: string;
	timestamp: Date;
	data: Record<string, unknown>;
}

/**
 * Improved pgflow state management for Svelte 5
 *
 * Key improvements over original:
 * - Accepts step slugs for event subscription
 * - Wraps FlowRun instances instead of client
 * - Cleaner separation of concerns
 * - Follows documented pgflow patterns
 */
export function createFlowState<TFlow extends AnyFlow>(
	client: PgflowClient,
	flowSlug: string,
	stepSlugs: string[] = []
) {
	// ✅ Reactive state
	let run = $state<FlowRun<TFlow> | null>(null);
	let status = $state<string>('idle');
	let output = $state<unknown>(null);
	let error = $state<string | null>(null);
	let activeStep = $state<string | null>(null);
	let events = $state<FlowEvent[]>([]);
	let stepStatuses = $state<Record<string, string>>({});

	// ✅ Non-reactive internals (function-scoped, effectively private)
	const _client = $state.raw(client);
	const _flowSlug = $state.raw(flowSlug);
	const _unsubscribers = $state.raw<Array<() => void>>([]);

	/**
	 * Start a new flow run
	 */
	async function startFlow(input: ExtractFlowInput<TFlow>) {
		clear();
		status = 'starting';

		try {
			const flowRun = await _client.startFlow<TFlow>(_flowSlug, input);
			_setupRun(flowRun);
			return flowRun;
		} catch (err) {
			status = 'error';
			error = err instanceof Error ? err.message : String(err);
			throw err;
		}
	}

	/**
	 * Attach to an existing flow run (e.g., from getRun)
	 */
	function attachRun(flowRun: FlowRun<TFlow>) {
		clear();
		_setupRun(flowRun);
	}

	function _setupRun(flowRun: FlowRun<TFlow>) {
		run = flowRun;
		status = flowRun.status;
		output = flowRun.output;
		error = flowRun.error_message;

		// Initialize step statuses and events from flowRun's initial state
		const initialEvents: FlowEvent[] = [];

		// Add run-level initial event
		initialEvents.push({
			event_type: `run:${flowRun.status}`,
			timestamp: flowRun.started_at || new SvelteDate(),
			data: {
				status: flowRun.status,
				run_id: flowRun.run_id
			}
		});

		if (flowRun.stepStates) {
			const initialStepStatuses: Record<string, string> = {};
			let foundActiveStep: string | null = null;

			flowRun.stepStates.forEach((stepState) => {
				// Only initialize statuses for steps we're tracking
				if (stepSlugs.includes(stepState.step_slug)) {
					initialStepStatuses[stepState.step_slug] = stepState.status;

					// Create synthetic event for this step's current status
					// Use the appropriate timestamp field based on status
					let timestamp = new SvelteDate();
					if (stepState.status === 'completed' && stepState.completed_at) {
						timestamp = stepState.completed_at;
					} else if (stepState.status === 'failed' && stepState.failed_at) {
						timestamp = stepState.failed_at;
					} else if (stepState.status === 'started' && stepState.started_at) {
						timestamp = stepState.started_at;
					}

					// Create event data matching the structure of real events from subscriptions
					initialEvents.push({
						event_type: `step:${stepState.status}`,
						timestamp,
						data: {
							step_slug: stepState.step_slug,
							status: stepState.status,
							output: stepState.output,
							error: stepState.error,
							error_message: stepState.error_message,
							started_at: stepState.started_at,
							completed_at: stepState.completed_at,
							failed_at: stepState.failed_at
						}
					});

					// Track if this step is currently active
					if (!foundActiveStep && stepState.status === 'started') {
						foundActiveStep = stepState.step_slug;
					}
				}
			});

			stepStatuses = initialStepStatuses;

			if (foundActiveStep) {
				activeStep = foundActiveStep;
				console.log('Initialized activeStep from flowRun:', foundActiveStep);
			}
			console.log('Initialized step statuses from flowRun:', stepStatuses);
		}

		// Set initial events (sorted by timestamp)
		events = initialEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
		console.log('Created initial events:', events.length);

		// Set up run-level events
		const unsubRun = flowRun.on('*', (event) => {
			events = [
				...events,
				{
					event_type: `run:${event.status}`,
					timestamp: new SvelteDate(),
					data: event as Record<string, unknown>
				}
			];

			status = event.status;

			if (event.status === 'completed' && event.output) {
				output = event.output;
			} else if (event.status === 'failed') {
				error = event.error_message || 'Flow failed';
			}
		});

		if (typeof unsubRun === 'function') {
			_unsubscribers.push(unsubRun);
		}

		// Set up step-level events
		console.log('Setting up step event listeners for:', stepSlugs);
		stepSlugs.forEach((stepSlug) => {
			const step = flowRun.step(stepSlug);
			const unsubStep = step.on('*', (event) => {
				console.log(`Step event received for ${stepSlug}:`, event);
				events = [
					...events,
					{
						event_type: `step:${event.status}`,
						timestamp: new SvelteDate(),
						data: { ...(event as Record<string, unknown>), step_slug: stepSlug }
					}
				];

				// Track step status
				stepStatuses = { ...stepStatuses, [stepSlug]: event.status };

				if (event.status === 'started') {
					console.log(`Setting activeStep to: ${stepSlug}`);
					activeStep = stepSlug;
				} else if (event.status === 'completed' && activeStep === stepSlug) {
					console.log(`Clearing activeStep (was: ${stepSlug})`);
					activeStep = null;
				}
			});

			if (typeof unsubStep === 'function') {
				_unsubscribers.push(unsubStep);
			}
		});
	}

	function clear() {
		_unsubscribers.forEach((unsub) => unsub());
		_unsubscribers.length = 0;

		run = null;
		status = 'idle';
		output = null;
		error = null;
		activeStep = null;
		events = [];
		stepStatuses = {};
	}

	/**
	 * Clean up subscriptions
	 * Call when done with the flow or on component unmount
	 */
	function dispose() {
		clear();
	}

	return {
		// Reactive state (using getters for proper reactivity)
		get run() {
			return run;
		},
		get status() {
			return status;
		},
		get output() {
			return output;
		},
		get error() {
			return error;
		},
		get activeStep() {
			return activeStep;
		},
		get events() {
			return events;
		},
		get stepStatuses() {
			return stepStatuses;
		},

		// Methods
		startFlow,
		attachRun,
		dispose
	};
}

/**
 * Example usage:
 *
 * ```svelte
 * <script lang="ts">
 *   import { pgflow } from '$lib/supabase';
 *   import { createFlowState } from '$lib/stores/pgflow-state-improved.svelte';
 *   import type ArticleFlow from './article_flow';
 *
 *   // Create state with step slugs for event subscription
 *   const flowState = createFlowState<typeof ArticleFlow>(
 *     pgflow,
 *     'article_flow',
 *     ['fetchArticle', 'summarize', 'extractKeywords', 'publish']
 *   );
 *
 *   async function start() {
 *     await flowState.startFlow({ url: 'https://example.com' });
 *   }
 *
 *   // Cleanup on unmount
 *   onDestroy(() => flowState.dispose());
 * </script>
 *
 * <p>Status: {flowState.status}</p>
 * <p>Active Step: {flowState.activeStep}</p>
 * ```
 */

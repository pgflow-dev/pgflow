import type { FlowRun, PgflowClient } from '@pgflow/client';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';

/**
 * Improved pgflow state management for Svelte 5
 *
 * Key improvements over original:
 * - Auto-discovers steps from FlowRun (no manual list)
 * - Wraps FlowRun instances instead of client
 * - Cleaner separation of concerns
 * - Follows documented pgflow patterns
 */
export function createFlowState<TFlow extends AnyFlow>(
	client: PgflowClient,
	flowSlug: string
) {
	// ✅ Reactive state
	let run = $state<FlowRun<TFlow> | null>(null);
	let status = $state<string>('idle');
	let output = $state<any>(null);
	let error = $state<string | null>(null);
	let activeStep = $state<string | null>(null);
	let events = $state<Array<{ event_type: string; timestamp: Date; data: any }>>([]);

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

		// ✅ Auto-discover steps from run state
		const stepSlugs = flowRun.stepStates?.map((s) => s.step_slug) || [];

		// Set up run-level events
		const unsubRun = flowRun.on('*', (event) => {
			events = [
				...events,
				{
					event_type: `run:${event.status}`,
					timestamp: new Date(),
					data: event
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

		// Set up step-level events (auto-discovered)
		stepSlugs.forEach((stepSlug) => {
			const step = flowRun.step(stepSlug);
			const unsubStep = step.on('*', (event) => {
				events = [
					...events,
					{
						event_type: `step:${event.status}`,
						timestamp: new Date(),
						data: { ...event, step_slug: stepSlug }
					}
				];

				if (event.status === 'in_progress' || event.status === 'started') {
					activeStep = stepSlug;
				} else if (event.status === 'completed' && activeStep === stepSlug) {
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
 *   // Create state (no step list needed!)
 *   const flowState = createFlowState<typeof ArticleFlow>(pgflow, 'article_flow');
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

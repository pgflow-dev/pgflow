import type { FlowRun, PgflowClient } from '@pgflow/client';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import { SvelteDate } from 'svelte/reactivity';

interface FlowEvent {
	event_type: string;
	timestamp: Date; // When event was received/created locally (client time)
	occurred_at?: Date; // Actual event time from broadcast payload (server time)
	data: Record<string, unknown>;
	step_slug?: string; // For step events
}

interface TimelineEvent extends FlowEvent {
	cumulativeMs: number; // Milliseconds from first event
	deltaMs: number; // Milliseconds from previous event
	cumulativeDisplay: string; // Formatted cumulative time (e.g., "0:01.234")
	deltaDisplay: string; // Formatted delta time (e.g., "+1.234s")
}

/**
 * Format milliseconds as human-readable time
 * Examples: "0:00.000", "0:01.234", "1:23.456"
 */
function formatMs(ms: number): string {
	if (ms < 0) return '0:00.000';

	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const milliseconds = Math.floor(ms % 1000);

	return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Format delta time with + prefix and simplified display
 * Examples: "+0ms", "+123ms", "+1.234s"
 */
function formatDelta(ms: number): string {
	if (ms < 1000) {
		return `+${Math.floor(ms)}ms`;
	}

	const seconds = (ms / 1000).toFixed(3);
	return `+${seconds}s`;
}

/**
 * Improved pgflow state management for Svelte 5
 *
 * Returns a reactive "runState" that mirrors FlowRun's API but with reactive properties.
 * Key improvements:
 * - step() method returns reactive step properties (status, output, etc.)
 * - Delegates to FlowRun/FlowStep as single source of truth (no duplicate state)
 * - Intuitive API that matches FlowRun structure
 * - All step properties are automatically reactive
 * - Prevents common reactivity bugs
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

	// Version counter to trigger reactivity when FlowRun/FlowStep state changes
	// Increment this whenever events update the underlying FlowRun state
	let stateVersion = $state(0);

	// ✅ Non-reactive internals (function-scoped, effectively private)
	const _client = $state.raw(client);
	const _flowSlug = $state.raw(flowSlug);
	const _unsubscribers = $state.raw<Array<() => void>>([]);

	// Debug: Track all broadcast events
	const _debugEvents = $state.raw<Array<{ type: string; time: Date }>>([]);

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

		// Check for any currently active steps
		let foundActiveStep: string | null = null;
		stepSlugs.forEach((stepSlug) => {
			const step = flowRun.step(stepSlug);

			if (!foundActiveStep && step.status === 'started') {
				foundActiveStep = stepSlug;
			}
		});

		if (foundActiveStep) {
			activeStep = foundActiveStep;
		}

		// Set up run-level events
		const unsubRun = flowRun.on('*', (event) => {
			const now = new SvelteDate();
			const occurredAt =
				event.status === 'started' && 'started_at' in event
					? new Date(event.started_at)
					: event.status === 'completed' && 'completed_at' in event
						? new Date(event.completed_at)
						: event.status === 'failed' && 'failed_at' in event
							? new Date(event.failed_at)
							: undefined;

			// DEBUG: Log broadcast event
			const debugEventType = `run:${event.status}`;
			_debugEvents.push({ type: debugEventType, time: now });
			console.log('[EVENT]', debugEventType, event);

			events = [
				...events,
				{
					event_type: `run:${event.status}`,
					timestamp: now,
					occurred_at: occurredAt,
					data: event as Record<string, unknown>
				}
			];

			status = event.status;

			if (event.status === 'completed' && event.output) {
				output = event.output;
				// DEBUG: Log summary of all events received
				console.log('[EVENTS SUMMARY]', {
					total: _debugEvents.length,
					events: _debugEvents.map((e) => e.type)
				});
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
				const now = new SvelteDate();
				const occurredAt =
					event.status === 'started' && 'started_at' in event
						? new Date(event.started_at)
						: event.status === 'completed' && 'completed_at' in event
							? new Date(event.completed_at)
							: event.status === 'failed' && 'failed_at' in event
								? new Date(event.failed_at)
								: undefined;

				// DEBUG: Log broadcast event
				const debugEventType = `step:${event.status} (${stepSlug})`;
				_debugEvents.push({ type: debugEventType, time: now });
				console.log('[EVENT]', debugEventType, event);

				events = [
					...events,
					{
						event_type: `step:${event.status}`,
						timestamp: now,
						occurred_at: occurredAt,
						step_slug: stepSlug,
						data: { ...(event as Record<string, unknown>), step_slug: stepSlug }
					}
				];

				// Increment version to trigger reactivity in step() getters
				// FlowRun/FlowStep already updated their state before emitting event
				stateVersion++;

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
		stateVersion = 0;
		_debugEvents.length = 0;
	}

	/**
	 * Get reactive step state
	 * Returns an object with reactive getters that delegate to FlowRun.step()
	 * This is a thin reactive wrapper - FlowRun/FlowStep maintain the actual state
	 */
	function step(stepSlug: string) {
		return {
			get status() {
				// Track stateVersion for reactivity
				stateVersion;
				return run?.step(stepSlug).status || 'created';
			},
			get output() {
				// Track stateVersion for reactivity
				stateVersion;
				return run?.step(stepSlug).output;
			},
			get error() {
				// Track stateVersion for reactivity
				stateVersion;
				return run?.step(stepSlug).error_message;
			},
			get started_at() {
				// Track stateVersion for reactivity
				stateVersion;
				return run?.step(stepSlug).started_at;
			},
			get completed_at() {
				// Track stateVersion for reactivity
				stateVersion;
				return run?.step(stepSlug).completed_at;
			},
			get failed_at() {
				// Track stateVersion for reactivity
				stateVersion;
				return run?.step(stepSlug).failed_at;
			}
		};
	}

	/**
	 * Clean up subscriptions
	 * Call when done with the flow or on component unmount
	 */
	function dispose() {
		clear();
	}

	// Return runState that mirrors FlowRun API with reactive properties
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
		get timeline(): TimelineEvent[] {
			if (!events.length) return [];

			const firstTime = events[0].timestamp.getTime();

			return events.map((event, i) => {
				const cumulative = event.timestamp.getTime() - firstTime;
				const delta = i > 0 ? event.timestamp.getTime() - events[i - 1].timestamp.getTime() : 0;

				return {
					...event,
					cumulativeMs: cumulative,
					deltaMs: delta,
					cumulativeDisplay: formatMs(cumulative),
					deltaDisplay: formatDelta(delta)
				};
			});
		},

		// DEBUG: Expose debug events for inspection
		get debugEvents() {
			return _debugEvents;
		},

		// Reactive step access - mirrors FlowRun.step() API
		step,

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
 *   import { createFlowState } from '$lib/stores/pgflow-state.svelte';
 *   import type ArticleFlow from './article_flow';
 *
 *   // Create runState with step slugs for event subscription
 *   const runState = createFlowState<typeof ArticleFlow>(
 *     pgflow,
 *     'article_flow',
 *     ['fetchArticle', 'summarize', 'extractKeywords', 'publish']
 *   );
 *
 *   async function start() {
 *     await runState.startFlow({ url: 'https://example.com' });
 *   }
 *
 *   // Cleanup on unmount
 *   onDestroy(() => runState.dispose());
 * </script>
 *
 * <!-- Access run-level state -->
 * <p>Status: {runState.status}</p>
 * <p>Active Step: {runState.activeStep}</p>
 *
 * <!-- Access step-level state (all reactive!) -->
 * <p>Fetch status: {runState.step('fetchArticle').status}</p>
 * <p>Fetch output: {runState.step('fetchArticle').output}</p>
 * ```
 */

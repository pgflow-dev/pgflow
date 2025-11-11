import type { FlowRun } from '@pgflow/client';
import type { AnyFlow } from '@pgflow/dsl';
import { onDestroy } from 'svelte';

interface FlowRunEvent {
	event_type: string;
	timestamp: Date;
	data: any;
}

/**
 * Creates reactive state for a pgflow FlowRun with automatic event handling and cleanup.
 *
 * This pattern follows Svelte 5 best practices and the documented pgflow client usage:
 * - Use PgflowClient directly to start flows (as documented)
 * - Wrap the resulting FlowRun for reactive state management
 * - Automatic discovery of steps from run state
 * - Automatic cleanup on component unmount
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { pgflow } from '$lib/supabase';
 *   import { useFlowRun } from '$lib/stores/use-flow-run.svelte';
 *   import type ArticleFlow from './article_flow';
 *
 *   let flowState = $state<ReturnType<typeof useFlowRun<typeof ArticleFlow>> | null>(null);
 *
 *   async function startFlow() {
 *     // Use pgflow client directly (as documented)
 *     const run = await pgflow.startFlow<typeof ArticleFlow>('article_flow', {
 *       url: 'https://example.com'
 *     });
 *
 *     // Wrap the run for reactive state
 *     flowState = useFlowRun(run);
 *   }
 * </script>
 *
 * {#if flowState}
 *   <p>Status: {flowState.status}</p>
 *   <p>Active Step: {flowState.activeStep}</p>
 * {/if}
 * ```
 */
export function useFlowRun<TFlow extends AnyFlow>(run: FlowRun<TFlow>) {
	// ✅ Reactive state
	let status = $state(run.status);
	let output = $state<any>(run.output);
	let error = $state<string | null>(run.error_message);
	let activeStep = $state<string | null>(null);
	let events = $state<FlowRunEvent[]>([]);

	// ✅ Non-reactive internals
	const unsubscribers = $state.raw<Array<() => void>>([]);

	// Auto-discover step slugs from run state
	const stepSlugs = $state.raw<string[]>(
		run.stepStates?.map((s) => s.step_slug) || []
	);

	// Set up run-level event listeners
	const unsubRun = run.on('*', (event) => {
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
		unsubscribers.push(unsubRun);
	}

	// Set up step-level event listeners (auto-discovered)
	stepSlugs.forEach((stepSlug) => {
		const step = run.step(stepSlug);
		const unsubStep = step.on('*', (event) => {
			events = [
				...events,
				{
					event_type: `step:${event.status}`,
					timestamp: new Date(),
					data: { ...event, step_slug: stepSlug }
				}
			];

			if (event.status === 'started') {
				activeStep = stepSlug;
			} else if (event.status === 'completed' && activeStep === stepSlug) {
				activeStep = null;
			}
		});

		if (typeof unsubStep === 'function') {
			unsubscribers.push(unsubStep);
		}
	});

	// ✅ Automatic cleanup when component unmounts
	onDestroy(() => {
		unsubscribers.forEach((unsub) => unsub());
	});

	// Return reactive state (using getters for reactivity)
	return {
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
		get run() {
			return run;
		}
	};
}

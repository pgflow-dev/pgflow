import type { FlowRun, PgflowClient } from '@pgflow/client';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import { SvelteMap, SvelteDate } from 'svelte/reactivity';

interface FlowEvent {
	event_type: string;
	timestamp: Date;
	data: Record<string, unknown>;
}

interface PgflowStateConfig {
	client: PgflowClient;
	flowSlug: string;
	stepSlugs: string[];
}

/**
 * Svelte 5 runes-based state management for pgflow
 *
 * Best practices applied:
 * - $state for reactive data
 * - $state.raw for non-reactive objects (client, config)
 * - $derived for computed values
 * - Proper cleanup via dispose()
 */
class PgflowState<TFlow extends AnyFlow = AnyFlow> {
	// ✅ Reactive state - these trigger UI updates
	run = $state<FlowRun<TFlow> | null>(null);
	activeStep = $state<string | null>(null);
	status = $state<string>('idle');
	output = $state<unknown>(null);
	events = $state<FlowEvent[]>([]);
	error = $state<string | null>(null);

	// ✅ Non-reactive objects - don't need deep tracking
	#client = $state.raw<PgflowClient>(null!);
	#flowSlug = $state.raw<string>('');
	#stepSlugs = $state.raw<string[]>([]);
	#unsubscribers = $state.raw<Array<() => void>>([]);

	constructor(config: PgflowStateConfig) {
		this.#client = config.client;
		this.#flowSlug = config.flowSlug;
		this.#stepSlugs = config.stepSlugs;
	}

	// ✅ Derived state - automatically recomputes when dependencies change
	steps = $derived(() => {
		if (!this.run) return new SvelteMap();

		const stepMap = new SvelteMap();
		if (this.run.stepStates) {
			this.run.stepStates.forEach((stepState) => {
				stepMap.set(stepState.stepSlug, stepState);
			});
		}

		return stepMap;
	});

	async startFlow(input: ExtractFlowInput<TFlow>) {
		this.clear();
		this.status = 'starting';

		try {
			const run = await this.#client.startFlow<TFlow>(this.#flowSlug, input);
			this.#setupRun(run);
			return run;
		} catch (error) {
			this.status = 'error';
			this.error = error instanceof Error ? error.message : String(error);
			throw error;
		}
	}

	#setupRun(run: FlowRun<TFlow>) {
		this.run = run;
		this.status = 'started';
		this.events = [];
		this.output = null;
		this.error = null;

		// Set up run-level event listeners
		const unsubRun = run.on('*', (event) => {
			this.#addEvent('run', event);
			this.status = event.status || this.status;

			if (event.status === 'completed' && event.output) {
				this.output = event.output;
			} else if (event.status === 'failed') {
				this.status = 'failed';
				this.error = event.error_message || 'Flow failed';
			}
		});

		// Store unsubscriber if available
		if (typeof unsubRun === 'function') {
			this.#unsubscribers.push(unsubRun);
		}

		// Set up step-level event listeners
		this.#stepSlugs.forEach((stepSlug) => {
			const step = run.step(stepSlug);
			const unsubStep = step.on('*', (event) => {
				this.#addEvent('step', { ...event, step_slug: stepSlug });

				if (event.status === 'started') {
					this.activeStep = stepSlug;
				} else if (event.status === 'completed' && this.activeStep === stepSlug) {
					this.activeStep = null;
				}
			});

			if (typeof unsubStep === 'function') {
				this.#unsubscribers.push(unsubStep);
			}
		});
	}

	#addEvent(type: 'run' | 'step', data: Record<string, unknown>) {
		this.events = [
			...this.events,
			{
				event_type:
					type === 'run'
						? `run:${(data as { status: string }).status}`
						: `step:${(data as { status: string }).status}`,
				timestamp: new SvelteDate(),
				data
			}
		];
	}

	clear() {
		this.run = null;
		this.activeStep = null;
		this.status = 'idle';
		this.output = null;
		this.error = null;
		this.events = [];
	}

	/**
	 * Clean up event subscriptions
	 * Call this when the component unmounts or when switching flows
	 */
	dispose() {
		this.#unsubscribers.forEach((unsub) => unsub());
		this.#unsubscribers = [];
		this.clear();
	}
}

/**
 * Factory function to create a typed pgflow state instance
 *
 * @example
 * ```ts
 * import type ArticleFlow from './article_flow';
 *
 * const articleFlowState = createPgflowState<typeof ArticleFlow>(
 *   pgflowClient,
 *   'article_flow',
 *   ['fetchArticle', 'summarize', 'extractKeywords', 'publish']
 * );
 *
 * // Start the flow
 * await articleFlowState.startFlow({ url: 'https://example.com' });
 *
 * // Clean up when done
 * articleFlowState.dispose();
 * ```
 */
export function createPgflowState<TFlow extends AnyFlow>(
	client: PgflowClient,
	flowSlug: string,
	stepSlugs: string[]
) {
	return new PgflowState<TFlow>({
		client,
		flowSlug,
		stepSlugs
	});
}

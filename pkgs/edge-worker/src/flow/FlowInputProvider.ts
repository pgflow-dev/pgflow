import type postgres from 'postgres';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';

/**
 * Provides lazy loading and caching of flow input for step handlers.
 *
 * When `start_tasks` returns `flow_input = NULL` (for dependent and map steps),
 * handlers that need to access the original flow input can do so via
 * `await ctx.flowInput`. This class:
 *
 * 1. Caches flow input per run_id to avoid duplicate fetches
 * 2. Deduplicates concurrent requests for the same run_id
 * 3. Populates cache from task records when flow_input is provided
 *
 * This optimization reduces data transfer significantly for map steps
 * processing large arrays, where each of potentially thousands of tasks
 * would otherwise carry the full flow input.
 */
export class FlowInputProvider<TFlow extends AnyFlow> {
  private cache = new Map<string, ExtractFlowInput<TFlow>>();
  private pending = new Map<string, Promise<ExtractFlowInput<TFlow>>>();

  constructor(private readonly sql: postgres.Sql) {}

  /**
   * Get flow input for a run, fetching from DB if not cached.
   * Concurrent requests for the same run_id share the same promise.
   */
  get(runId: string): Promise<ExtractFlowInput<TFlow>> {
    // 1. Check cache
    const cached = this.cache.get(runId);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    // 2. Dedupe concurrent awaits for same run_id
    const pending = this.pending.get(runId);
    if (pending) {
      return pending;
    }

    // 3. Fetch and cache
    const promise = this.fetchAndCache(runId);
    this.pending.set(runId, promise);
    return promise;
  }

  /**
   * Populate cache from task record when flow_input is provided by SQL.
   * Called by StepTaskPoller when processing root non-map steps.
   */
  populate(runId: string, flowInput: ExtractFlowInput<TFlow>): void {
    if (!this.cache.has(runId)) {
      this.cache.set(runId, flowInput);
    }
  }

  /**
   * Check if flow input is cached for a run.
   * Useful for testing and debugging.
   */
  has(runId: string): boolean {
    return this.cache.has(runId);
  }

  /**
   * Clear all cached flow inputs.
   * Useful for testing or when worker restarts.
   */
  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  private async fetchAndCache(runId: string): Promise<ExtractFlowInput<TFlow>> {
    try {
      const [row] = await this.sql<{ input: ExtractFlowInput<TFlow> }[]>`
        SELECT input FROM pgflow.runs WHERE run_id = ${runId}
      `;

      if (!row) {
        throw new Error(`Run not found: ${runId}`);
      }

      const flowInput = row.input;
      this.cache.set(runId, flowInput);
      return flowInput;
    } finally {
      this.pending.delete(runId);
    }
  }
}

import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import type { IFlowClient, FlowRunState, BroadcastRunEvent, BroadcastStepEvent, Unsubscribe } from './types';
import { SupabaseBroadcastAdapter } from './SupabaseBroadcastAdapter';
import { FlowRun } from './FlowRun';

/**
 * Client for interacting with pgflow
 */
export class PgflowClient implements IFlowClient {
  #supabase: SupabaseClient;
  #realtimeAdapter: SupabaseBroadcastAdapter;
  #runs = new Map<string, FlowRun<AnyFlow>>();

  /**
   * Creates a new PgflowClient instance
   *
   * @param supabaseClient - Supabase client instance
   */
  constructor(supabaseClient: SupabaseClient) {
    this.#supabase = supabaseClient;
    this.#realtimeAdapter = new SupabaseBroadcastAdapter(supabaseClient);

    // Set up global event listeners
    this.#realtimeAdapter.onRunEvent((event) => {
      const run = this.#runs.get(event.run_id);
      if (run) {
        run.updateState(event);
      }
    });

    this.#realtimeAdapter.onStepEvent((event) => {
      const run = this.#runs.get(event.run_id);
      if (run) {
        // The step might not exist yet, but FlowRun.step() will create it if needed
        const stepSlug = event.step_slug;
        run.step(stepSlug).updateState(event);
      }
    });
  }

  /**
   * Start a flow with optional run_id
   *
   * @param flow_slug - Flow slug to start
   * @param input - Input data for the flow
   * @param run_id - Optional run ID (will be generated if not provided)
   * @returns Promise that resolves with the FlowRun instance
   */
  async startFlow<TFlow extends AnyFlow>(
    flow_slug: string,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<FlowRun<TFlow>> {
    // Generate a run_id if not provided
    const id = run_id || uuidv4();

    // Create initial state for the flow run
    const initialState: FlowRunState<TFlow> = {
      run_id: id,
      flow_slug,
      status: 'queued',
      input: input as ExtractFlowInput<TFlow>,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
      remaining_steps: 0, // Will be updated with real value from start_flow
    };

    // Create the flow run instance
    const run = new FlowRun<TFlow>(initialState);

    // Store the run
    this.#runs.set(id, run);

    // Set up subscription for run and step events
    this.#realtimeAdapter.subscribeToRun(id);

    // Start the flow with the predetermined run_id
    const { data, error } = await this.#supabase.schema('pgflow').rpc('start_flow_with_states', {
      flow_slug: flow_slug,
      input: input as Record<string, unknown>,
      run_id: id
    });

    if (error) {
      // Clean up subscription and run instance
      this.dispose(id);
      throw error;
    }

    // Update the run state with the complete initial state snapshot
    if (data.run) {
      run.updateState({
        ...data.run,
        status: data.run.status,
        run_id: data.run.run_id, // Correctly use run_id instead of id
      });
    }

    // Update step states from the initial snapshot
    if (data.steps && Array.isArray(data.steps)) {
      for (const stepState of data.steps) {
        run.step(stepState.step_slug).updateState({
          ...stepState,
          status: stepState.status,
          run_id: id,
          step_slug: stepState.step_slug,
        });
      }
    }

    return run;
  }

  /**
   * Dispose a specific flow run
   *
   * @param runId - Run ID to dispose
   */
  dispose(runId: string): void {
    const run = this.#runs.get(runId);
    if (run) {
      // First unsubscribe from the realtime adapter
      this.#realtimeAdapter.unsubscribe(runId);
      
      // Then dispose the run
      run.dispose();
      
      // Finally remove from the runs map
      this.#runs.delete(runId);
    }
  }

  /**
   * Dispose all flow runs
   */
  disposeAll(): void {
    for (const runId of this.#runs.keys()) {
      this.dispose(runId);
    }
  }

  // Delegate IFlowRealtime methods to the adapter

  /**
   * Fetch flow definition metadata
   */
  async fetchFlowDefinition(flow_slug: string) {
    return this.#realtimeAdapter.fetchFlowDefinition(flow_slug);
  }

  /**
   * Register a callback for run events
   * @returns Function to unsubscribe from the event
   */
  onRunEvent(callback: (event: BroadcastRunEvent) => void): Unsubscribe {
    return this.#realtimeAdapter.onRunEvent(callback);
  }

  /**
   * Register a callback for step events
   * @returns Function to unsubscribe from the event
   */
  onStepEvent(callback: (event: BroadcastStepEvent) => void): Unsubscribe {
    return this.#realtimeAdapter.onStepEvent(callback);
  }

  /**
   * Subscribe to a flow run's events
   */
  subscribeToRun(run_id: string): () => void {
    return this.#realtimeAdapter.subscribeToRun(run_id);
  }

  /**
   * Fetch current state of a run and its steps
   */
  async getRunWithStates(run_id: string) {
    return this.#realtimeAdapter.getRunWithStates(run_id);
  }
}

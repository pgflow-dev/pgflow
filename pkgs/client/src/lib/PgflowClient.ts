import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';
import type { RunRow } from '@pgflow/core';
import { FlowRunStatus } from './types.js';
import type { 
  IFlowClient, 
  FlowRunState, 
  BroadcastRunEvent, 
  BroadcastStepEvent, 
  Unsubscribe, 
  FlowRunBase
} from './types.js';
import { SupabaseBroadcastAdapter } from './SupabaseBroadcastAdapter.js';
import { FlowRun } from './FlowRun.js';
import { toTypedRunEvent, toTypedStepEvent, runRowToTypedEvent, stepStateRowToTypedEvent } from './eventAdapters.js';

/**
 * Client for interacting with pgflow
 */
export class PgflowClient<TFlow extends AnyFlow = AnyFlow> implements IFlowClient<TFlow> {
  #supabase: SupabaseClient;
  #realtimeAdapter: SupabaseBroadcastAdapter;
  // Use the widest event type - keeps the compiler happy but
  // still provides the structural API we need (updateState/step/...)
  #runs = new Map<string, FlowRunBase<unknown>>();

  /**
   * Creates a new PgflowClient instance
   *
   * @param supabaseClient - Supabase client instance
   */
  constructor(supabaseClient: SupabaseClient) {
    this.#supabase = supabaseClient;
    this.#realtimeAdapter = new SupabaseBroadcastAdapter(supabaseClient);

    // Set up global event listeners - properly typed
    this.#realtimeAdapter.onRunEvent((event: BroadcastRunEvent) => {
      const run = this.#runs.get(event.run_id);
      if (run) {
        // Convert broadcast event to typed event before updating state
        run.updateState(toTypedRunEvent(event));
      }
    });

    this.#realtimeAdapter.onStepEvent((event: BroadcastStepEvent) => {
      const run = this.#runs.get(event.run_id);
      if (run) {
        // Always materialize the step before updating to avoid event loss
        // This ensures we cache all steps even if they were never explicitly requested
        const stepSlug = event.step_slug;
        run.step(stepSlug).updateState(toTypedStepEvent(event));
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
  async startFlow<TSpecificFlow extends TFlow>(
    flow_slug: string,
    input: ExtractFlowInput<TSpecificFlow>,
    run_id?: string
  ): Promise<FlowRun<TSpecificFlow>> {
    // Generate a run_id if not provided
    const id = run_id || uuidv4();

    // Create initial state for the flow run
    const initialState: FlowRunState<TSpecificFlow> = {
      run_id: id,
      flow_slug,
      status: FlowRunStatus.Started,
      input: input as ExtractFlowInput<TSpecificFlow>,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
      remaining_steps: -1, // Use -1 to indicate unknown until first snapshot arrives
    };

    // Create the flow run instance
    const run = new FlowRun<TSpecificFlow>(initialState);

    // Store the run
    this.#runs.set(id, run);

    // Set up subscription for run and step events (wait for subscription confirmation)
    await this.#realtimeAdapter.subscribeToRun(id);

    // Start the flow with the predetermined run_id (only after subscription is ready)
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
      run.updateState(runRowToTypedEvent<TSpecificFlow>(data.run));
    }

    // Update step states from the initial snapshot
    if (data.steps && Array.isArray(data.steps)) {
      for (const stepState of data.steps) {
        run.step(stepState.step_slug).updateState(stepStateRowToTypedEvent<TSpecificFlow, any>(stepState));
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
  async subscribeToRun(run_id: string): Promise<() => void> {
    return await this.#realtimeAdapter.subscribeToRun(run_id);
  }

  /**
   * Fetch current state of a run and its steps
   */
  async getRunWithStates(run_id: string) {
    return this.#realtimeAdapter.getRunWithStates(run_id);
  }
  
  /**
   * Get a flow run by ID
   * 
   * @param run_id - ID of the run to get
   * @returns Promise that resolves with the FlowRun instance or null if not found
   */
  async getRun<TSpecificFlow extends TFlow = TFlow>(run_id: string): Promise<FlowRun<TSpecificFlow> | null> {
    // Check if we already have this run cached
    const existingRun = this.#runs.get(run_id);
    if (existingRun) {
      return existingRun as FlowRun<TSpecificFlow>;
    }
    
    try {
      // Fetch the run state from the database
      const { run, steps } = await this.getRunWithStates(run_id);
      
      if (!run) {
        return null;
      }
      
      // Create initial state for the flow run
      // Use type assertion since RunRow doesn't include error_message field
      const runData = run as unknown as (RunRow & { error_message?: string });
      
      // Validate required fields
      if (!runData.run_id || !runData.flow_slug || !runData.status) {
        throw new Error('Invalid run data: missing required fields');
      }
      
      // Validate status is a valid FlowRunStatus
      const validStatuses = Object.values(FlowRunStatus);
      if (!validStatuses.includes(runData.status as FlowRunStatus)) {
        throw new Error(`Invalid run data: invalid status '${runData.status}'`);
      }
      
      const initialState: FlowRunState<TSpecificFlow> = {
        run_id: runData.run_id,
        flow_slug: runData.flow_slug,
        status: runData.status as FlowRunStatus,
        input: runData.input as ExtractFlowInput<TSpecificFlow>,
        output: runData.output as any,
        error: runData.error_message ? new Error(runData.error_message) : null,
        error_message: runData.error_message || null,
        started_at: runData.started_at ? new Date(runData.started_at) : null,
        completed_at: runData.completed_at ? new Date(runData.completed_at) : null,
        failed_at: runData.failed_at ? new Date(runData.failed_at) : null,
        remaining_steps: runData.remaining_steps || 0,
      };
      
      // Create the flow run instance
      const flowRun = new FlowRun<TSpecificFlow>(initialState);
      
      // Store the run
      this.#runs.set(run_id, flowRun);
      
      // Set up subscription for run and step events
      await this.#realtimeAdapter.subscribeToRun(run_id);
      
      // Initialize steps
      if (steps && Array.isArray(steps)) {
        for (const stepState of steps) {
          // Validate step has required fields
          if (!stepState.step_slug || !stepState.status) {
            throw new Error('Invalid step data: missing required fields');
          }
          
          // Convert database step state to typed event
          flowRun.step(stepState.step_slug).updateState(stepStateRowToTypedEvent<AnyFlow, any>(stepState));
        }
      }
      
      return flowRun;
    } catch (error) {
      console.error('Error getting run:', error);
      // Re-throw if it's a validation error
      if (error instanceof Error && (error.message.includes('Invalid run data') || error.message.includes('Invalid step data'))) {
        throw error;
      }
      return null;
    }
  }
  
}

import { createNanoEvents } from 'nanoevents';
import type { AnyFlow, ExtractFlowInput, ExtractFlowOutput, ExtractFlowSteps } from '@pgflow/dsl';
import type { FlowRunState, FlowRunEvents, Unsubscribe, StepEvents } from './types';
import { FlowStep } from './FlowStep';

/**
 * Represents a single execution of a flow
 */
export class FlowRun<TFlow extends AnyFlow> {
  #state: FlowRunState<TFlow>;
  #events = createNanoEvents<FlowRunEvents<TFlow>>();
  #steps = new Map<string, FlowStep<TFlow, keyof ExtractFlowSteps<TFlow> & string>>();
  #statusPrecedence: Record<string, number> = {
    'queued': 0,
    'started': 1,
    'completed': 2,
    'failed': 3,
  };
  #disposed = false;

  /**
   * Creates a new FlowRun instance
   * 
   * @param initialState - Initial state for the run
   */
  constructor(initialState: FlowRunState<TFlow>) {
    this.#state = initialState;
  }

  /**
   * Get the run ID
   */
  get run_id(): string {
    return this.#state.run_id;
  }

  /**
   * Get the flow slug
   */
  get flow_slug(): string {
    return this.#state.flow_slug;
  }

  /**
   * Get the current status
   */
  get status(): 'queued' | 'started' | 'completed' | 'failed' {
    return this.#state.status;
  }

  /**
   * Get the started_at timestamp
   */
  get started_at(): Date | null {
    return this.#state.started_at;
  }

  /**
   * Get the completed_at timestamp
   */
  get completed_at(): Date | null {
    return this.#state.completed_at;
  }

  /**
   * Get the failed_at timestamp
   */
  get failed_at(): Date | null {
    return this.#state.failed_at;
  }

  /**
   * Get the flow input
   */
  get input(): ExtractFlowInput<TFlow> {
    return this.#state.input;
  }

  /**
   * Get the flow output
   */
  get output(): ExtractFlowOutput<TFlow> | null {
    return this.#state.output;
  }

  /**
   * Get the error object
   */
  get error(): Error | null {
    return this.#state.error;
  }

  /**
   * Get the error message
   */
  get error_message(): string | null {
    return this.#state.error_message;
  }

  /**
   * Get the number of remaining steps
   */
  get remaining_steps(): number {
    return this.#state.remaining_steps;
  }

  /**
   * Register an event handler for a run event
   * 
   * @param event - Event type to listen for
   * @param callback - Callback function to execute when event is emitted
   * @returns Function to unsubscribe from the event
   */
  on<E extends keyof FlowRunEvents<TFlow>>(
    event: E,
    callback: (event: FlowRunEvents<TFlow>[E]) => void
  ): Unsubscribe {
    return this.#events.on(event, callback);
  }

  /**
   * Get a FlowStep instance for a specific step
   * 
   * @param stepSlug - Step slug to get
   * @returns FlowStep instance for the specified step
   */
  step<TStepSlug extends keyof ExtractFlowSteps<TFlow> & string>(
    stepSlug: TStepSlug
  ): FlowStep<TFlow, TStepSlug> {
    // Look up if we already have this step cached
    const existingStep = this.#steps.get(stepSlug as string);
    if (existingStep) {
      return existingStep as FlowStep<TFlow, TStepSlug>;
    }

    // Create a new step instance with default state
    const step = new FlowStep<TFlow, TStepSlug>({
      run_id: this.run_id,
      step_slug: stepSlug,
      status: 'created',
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    });

    // Cache the step
    this.#steps.set(stepSlug as string, step);
    
    return step;
  }

  /**
   * Wait for the run to reach a specific status
   * 
   * @param targetStatus - The status to wait for
   * @param options - Optional timeout and abort signal
   * @returns Promise that resolves with the run instance when the status is reached
   */
  waitForStatus(
    targetStatus: 'completed' | 'failed',
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<this> {
    const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000; // Default 5 minutes
    const { signal } = options || {};

    // If we already have the target status, resolve immediately
    if (this.status === targetStatus) {
      return Promise.resolve(this);
    }

    // Otherwise, wait for the status to change
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      
      // Set up timeout if provided
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          unbind();
          reject(new Error(`Timeout waiting for run ${this.run_id} to reach status '${targetStatus}'`));
        }, timeoutMs);
      }
      
      // Set up abort signal if provided
      let abortCleanup: (() => void) | undefined;
      if (signal) {
        const abortHandler = () => {
          if (timeoutId) clearTimeout(timeoutId);
          unbind();
          reject(new Error(`Aborted waiting for run ${this.run_id} to reach status '${targetStatus}'`));
        };
        
        signal.addEventListener('abort', abortHandler);
        abortCleanup = () => {
          signal.removeEventListener('abort', abortHandler);
        };
      }
      
      // Subscribe to all events
      const unbind = this.on('*', (event) => {
        if (event.status === targetStatus) {
          if (timeoutId) clearTimeout(timeoutId);
          if (abortCleanup) abortCleanup();
          unbind();
          resolve(this);
        }
      });
    });
  }

  /**
   * Updates the run state based on an event
   * 
   * @param event - Event data to update the state with
   * @returns true if the state was updated, false otherwise
   */
  updateState(event: FlowRunEvents<TFlow>['*']): boolean {
    // Ensure this event is for this run
    if (event.run_id !== this.#state.run_id) {
      return false;
    }

    // Check if the event status has higher precedence than current status
    if (!this.#shouldUpdateStatus(this.#state.status, event.status)) {
      return false;
    }

    // Update state based on event type
    switch (event.status) {
      case 'started':
        this.#state = {
          ...this.#state,
          status: 'started',
          started_at: event.started_at ? new Date(event.started_at) : new Date(),
          remaining_steps: 'remaining_steps' in event ? Number(event.remaining_steps) : this.#state.remaining_steps,
        };
        this.#events.emit('started', event as FlowRunEvents<TFlow>['started']);
        break;

      case 'completed':
        this.#state = {
          ...this.#state,
          status: 'completed',
          completed_at: event.completed_at ? new Date(event.completed_at) : new Date(),
          output: event.output as ExtractFlowOutput<TFlow>,
          remaining_steps: 0,
        };
        this.#events.emit('completed', event as FlowRunEvents<TFlow>['completed']);
        
        // Check for auto-dispose
        this.#checkAutoDispose();
        break;

      case 'failed':
        this.#state = {
          ...this.#state,
          status: 'failed',
          failed_at: event.failed_at ? new Date(event.failed_at) : new Date(),
          error_message: event.error_message || 'Unknown error',
          error: new Error(event.error_message || 'Unknown error'),
        };
        this.#events.emit('failed', event as FlowRunEvents<TFlow>['failed']);
        
        // Check for auto-dispose
        this.#checkAutoDispose();
        break;

      default:
        return false;
    }

    // Also emit to the catch-all listener
    this.#events.emit('*', event);
    
    return true;
  }

  /**
   * Updates a step state based on an event
   * 
   * @param stepSlug - Step slug to update
   * @param event - Event data to update the step with
   * @returns true if the state was updated, false otherwise
   */
  updateStepState<TStepSlug extends keyof ExtractFlowSteps<TFlow> & string>(
    stepSlug: TStepSlug, 
    event: StepEvents<TFlow, TStepSlug>['*']
  ): boolean {
    const step = this.step(stepSlug);
    return step.updateState(event);
  }

  /**
   * Checks if auto-dispose should be triggered (when in terminal state with no listeners)
   */
  #checkAutoDispose(): void {
    // Don't auto-dispose multiple times
    if (this.#disposed) {
      return;
    }

    // Only auto-dispose in terminal states
    if (this.status !== 'completed' && this.status !== 'failed') {
      return;
    }

    // If there are no listeners, auto-dispose
    if (Object.keys(this.#events.events).length === 0) {
      this.dispose();
    }
  }

  /**
   * Determines if a status should be updated based on precedence
   * 
   * @param currentStatus - Current status
   * @param newStatus - New status
   * @returns true if the status should be updated, false otherwise
   */
  #shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
    // Don't allow changes to terminal states
    if (currentStatus === 'completed' || currentStatus === 'failed') {
      return false; // Terminal states should never change
    }
    
    const currentPrecedence = this.#statusPrecedence[currentStatus] || 0;
    const newPrecedence = this.#statusPrecedence[newStatus] || 0;

    // Only allow transitions to higher precedence non-terminal status
    return newPrecedence > currentPrecedence;
  }

  /**
   * Clean up all resources held by this run
   */
  dispose(): void {
    if (this.#disposed) {
      return;
    }

    // Clear the map to allow garbage collection of steps
    this.#steps.clear();
    
    // Clear all event listeners
    this.#events.events = {};
    
    // Mark as disposed
    this.#disposed = true;
  }
}
import { createNanoEvents } from 'nanoevents';
import type { AnyFlow, ExtractFlowInput, ExtractFlowOutput, ExtractFlowSteps } from '@pgflow/dsl';
import { 
  FlowRunStatus,
  FlowStepStatus
} from './types';
import type { 
  FlowRunState, 
  FlowRunEvents, 
  Unsubscribe, 
  FlowRunBase, 
  FlowStepBase,
  FlowRunEvent,
  StepEvent
} from './types';
import { FlowStep } from './FlowStep';

/**
 * Represents a single execution of a flow
 */
export class FlowRun<TFlow extends AnyFlow> implements FlowRunBase<FlowRunEvent<TFlow>> {
  #state: FlowRunState<TFlow>;
  #events = createNanoEvents<FlowRunEvents<TFlow>>();
  #steps = new Map<string, FlowStepBase>();
  #statusPrecedence: Record<FlowRunStatus, number> = {
    [FlowRunStatus.Queued]: 0,
    [FlowRunStatus.Started]: 1,
    [FlowRunStatus.Completed]: 2,
    [FlowRunStatus.Failed]: 3,
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
  get status(): FlowRunStatus {
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
    callback: FlowRunEvents<TFlow>[E]
  ): Unsubscribe {
    this.#listenerCount++;
    
    // Wrap the unsubscribe function to track listener count
    const unsubscribe = this.#events.on(event, callback);
    
    return () => {
      unsubscribe();
      this.#listenerCount--;
      this.#checkAutoDispose();
    };
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
      // Safe to cast since we only store steps with matching slugs
      return existingStep as unknown as FlowStep<TFlow, TStepSlug>;
    }

    // Create a new step instance with default state
    const step = new FlowStep<TFlow, TStepSlug>({
      run_id: this.run_id,
      step_slug: stepSlug,
      status: FlowStepStatus.Created,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    });

    // Cache the step
    this.#steps.set(stepSlug as string, step as FlowStepBase<StepEvent<TFlow, TStepSlug>>);
    
    return step;
  }
  
  /**
   * Check if this run has a specific step
   * 
   * @param stepSlug - Step slug to check
   * @returns true if the step exists, false otherwise
   */
  hasStep(stepSlug: string): boolean {
    // Check if we have this step cached
    return this.#steps.has(stepSlug);
  }

  /**
   * Wait for the run to reach a specific status
   * 
   * @param targetStatus - The status to wait for
   * @param options - Optional timeout and abort signal
   * @returns Promise that resolves with the run instance when the status is reached
   */
  waitForStatus(
    targetStatus: FlowRunStatus.Completed | FlowRunStatus.Failed,
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
  updateState(event: FlowRunEvent<TFlow>): boolean {
    // Validate the event is for this run
    if (event.run_id !== this.#state.run_id) {
      return false;
    }
    
    // Check if the event status has higher precedence than current status
    if (!this.#shouldUpdateStatus(this.#state.status, event.status)) {
      return false;
    }

    // Update state based on event type using narrowing type guards
    switch (event.status) {
      case FlowRunStatus.Started:
        this.#state = {
          ...this.#state,
          status: FlowRunStatus.Started,
          started_at: typeof event.started_at === 'string' ? new Date(event.started_at) : new Date(),
          remaining_steps: 'remaining_steps' in event ? Number(event.remaining_steps) : this.#state.remaining_steps,
        };
        this.#events.emit('started', event);
        break;

      case FlowRunStatus.Completed:
        this.#state = {
          ...this.#state,
          status: FlowRunStatus.Completed,
          completed_at: typeof event.completed_at === 'string' ? new Date(event.completed_at) : new Date(),
          output: event.output as ExtractFlowOutput<TFlow>,
          remaining_steps: 0,
        };
        this.#events.emit('completed', event);
        
        // Check for auto-dispose
        this.#checkAutoDispose();
        break;

      case FlowRunStatus.Failed:
        this.#state = {
          ...this.#state,
          status: FlowRunStatus.Failed,
          failed_at: typeof event.failed_at === 'string' ? new Date(event.failed_at) : new Date(),
          error_message: typeof event.error_message === 'string' ? event.error_message : 'Unknown error',
          error: new Error(typeof event.error_message === 'string' ? event.error_message : 'Unknown error'),
        };
        this.#events.emit('failed', event);
        
        // Check for auto-dispose
        this.#checkAutoDispose();
        break;

      default:
        // Exhaustiveness check - should never happen with proper types
        // @ts-expect-error Intentional exhaustiveness check
        const _exhaustivenessCheck: never = event;
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
    event: StepEvent<TFlow, TStepSlug>
  ): boolean {
    const step = this.step(stepSlug);
    return step.updateState(event);
  }

  // Track number of listeners
  #listenerCount = 0;
  
  /**
   * Checks if auto-dispose should be triggered (when in terminal state with no listeners)
   */
  #checkAutoDispose(): void {
    // Don't auto-dispose multiple times
    if (this.#disposed) {
      return;
    }

    // Only auto-dispose in terminal states
    if (this.status !== FlowRunStatus.Completed && this.status !== FlowRunStatus.Failed) {
      return;
    }

    // If there are no listeners, auto-dispose
    if (this.#listenerCount === 0) {
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
  #shouldUpdateStatus(currentStatus: FlowRunStatus, newStatus: FlowRunStatus): boolean {
    // Don't allow changes to terminal states
    if (currentStatus === FlowRunStatus.Completed || currentStatus === FlowRunStatus.Failed) {
      return false; // Terminal states should never change
    }
    
    const currentPrecedence = this.#statusPrecedence[currentStatus];
    const newPrecedence = this.#statusPrecedence[newStatus];

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
    
    // Create a new events object - this effectively clears all listeners
    // without accessing the private internals of nanoevents
    this.#events = createNanoEvents<FlowRunEvents<TFlow>>();
    this.#listenerCount = 0;
    
    // Mark as disposed
    this.#disposed = true;
  }
}
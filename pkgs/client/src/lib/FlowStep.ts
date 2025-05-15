import { createNanoEvents } from 'nanoevents';
import type { AnyFlow, ExtractFlowSteps, StepOutput } from '@pgflow/dsl';
import { FlowStepStatus } from './types';
import type { 
  FlowStepState, 
  StepEvents, 
  Unsubscribe, 
  FlowStepBase,
  StepEvent
} from './types';

/**
 * Represents a single step in a flow run
 */
export class FlowStep<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
> implements FlowStepBase<StepEvent<TFlow, TStepSlug>> {
  #state: FlowStepState<TFlow, TStepSlug>;
  #events = createNanoEvents<StepEvents<TFlow, TStepSlug>>();
  #statusPrecedence: Record<FlowStepStatus, number> = {
    [FlowStepStatus.Created]: 0,
    [FlowStepStatus.Started]: 1,
    [FlowStepStatus.Completed]: 2,
    [FlowStepStatus.Failed]: 3,
  };

  /**
   * Creates a new FlowStep instance
   * 
   * @param initialState - Initial state for the step
   */
  constructor(initialState: FlowStepState<TFlow, TStepSlug>) {
    this.#state = initialState;
  }

  /**
   * Get the step slug
   */
  get step_slug(): TStepSlug {
    return this.#state.step_slug;
  }

  /**
   * Get the current status
   */
  get status(): FlowStepStatus {
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
   * Get the step output
   */
  get output(): StepOutput<TFlow, TStepSlug> | null {
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
   * Register an event handler for a step event
   * 
   * @param event - Event type to listen for
   * @param callback - Callback function to execute when event is emitted
   * @returns Function to unsubscribe from the event
   */
  on<E extends keyof StepEvents<TFlow, TStepSlug>>(
    event: E,
    callback: StepEvents<TFlow, TStepSlug>[E]
  ): Unsubscribe {
    return this.#events.on(event, callback);
  }

  /**
   * Wait for the step to reach a specific status
   * 
   * @param targetStatus - The status to wait for
   * @param options - Optional timeout and abort signal
   * @returns Promise that resolves with the step instance when the status is reached
   */
  waitForStatus(
    targetStatus: FlowStepStatus.Started | FlowStepStatus.Completed | FlowStepStatus.Failed,
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
          reject(new Error(`Timeout waiting for step ${this.step_slug} to reach status '${targetStatus}'`));
        }, timeoutMs);
      }
      
      // Set up abort signal if provided
      let abortCleanup: (() => void) | undefined;
      if (signal) {
        const abortHandler = () => {
          if (timeoutId) clearTimeout(timeoutId);
          unbind();
          reject(new Error(`Aborted waiting for step ${this.step_slug} to reach status '${targetStatus}'`));
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
   * Updates the step state based on an event
   * 
   * @param event - Event data to update the state with
   * @returns true if the state was updated, false otherwise
   */
  updateState(event: StepEvent<TFlow, TStepSlug>): boolean {
    // Validate event is for this step
    if (event.step_slug !== this.#state.step_slug) {
      return false;
    }
    
    // Validate event is for this run
    if (event.run_id !== this.#state.run_id) {
      return false;
    }
    
    // Check if the event status has higher precedence than current status
    if (!this.#shouldUpdateStatus(this.#state.status, event.status)) {
      return false;
    }

    // Update state based on event type using narrowing type guards
    switch (event.status) {
      case FlowStepStatus.Started:
        this.#state = {
          ...this.#state,
          status: FlowStepStatus.Started,
          started_at: typeof event.started_at === 'string' ? new Date(event.started_at) : new Date(),
        };
        this.#events.emit('started', event);
        break;

      case FlowStepStatus.Completed:
        this.#state = {
          ...this.#state,
          status: FlowStepStatus.Completed,
          completed_at: typeof event.completed_at === 'string' ? new Date(event.completed_at) : new Date(),
          output: event.output as StepOutput<TFlow, TStepSlug>,
        };
        this.#events.emit('completed', event);
        break;

      case FlowStepStatus.Failed:
        this.#state = {
          ...this.#state,
          status: FlowStepStatus.Failed,
          failed_at: typeof event.failed_at === 'string' ? new Date(event.failed_at) : new Date(),
          error_message: typeof event.error_message === 'string' ? event.error_message : 'Unknown error',
          error: new Error(typeof event.error_message === 'string' ? event.error_message : 'Unknown error'),
        };
        this.#events.emit('failed', event);
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
   * Determines if a status should be updated based on precedence
   * 
   * @param currentStatus - Current status
   * @param newStatus - New status
   * @returns true if the status should be updated, false otherwise
   */
  #shouldUpdateStatus(currentStatus: FlowStepStatus, newStatus: FlowStepStatus): boolean {
    // Don't allow changes to terminal states
    if (currentStatus === FlowStepStatus.Completed || currentStatus === FlowStepStatus.Failed) {
      return false; // Terminal states should never change
    }
    
    const currentPrecedence = this.#statusPrecedence[currentStatus];
    const newPrecedence = this.#statusPrecedence[newStatus];

    // Only allow transitions to higher precedence non-terminal status
    return newPrecedence > currentPrecedence;
  }
}
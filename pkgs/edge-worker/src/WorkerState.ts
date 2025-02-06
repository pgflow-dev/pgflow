import { getLogger } from './Logger.ts';

export enum States {
  /** The worker has been created but has not yet started. */
  Created = 'created',

  /** The worker is starting but has not yet started processing messages. */
  Starting = 'starting',

  /** The worker is processing messages. */
  Running = 'running',

  /** The worker stopped processing messages but is still releasing resources. */
  Stopping = 'stopping',

  /** The worker has stopped processing messages and released resources
   * and can be discarded. */
  Stopped = 'stopped',
}

export const Transitions: Record<States, States[]> = {
  [States.Created]: [States.Starting],
  [States.Starting]: [States.Running],
  [States.Running]: [States.Stopping],
  [States.Stopping]: [States.Stopped],
  [States.Stopped]: [], // Terminal state - no valid transitions from here
};

export class TransitionError extends Error {
  constructor(options: { from: States; to: States }) {
    super(`Cannot transition from ${options.from} to ${options.to}`);
  }
}

/**
 * Represents the state of a worker and exposes method for doing allowed transitions
 */
export class WorkerState {
  private logger = getLogger('WorkerState');
  private state: States = States.Created;

  get current() {
    return this.state;
  }

  get isCreated() {
    return this.state === States.Created;
  }

  get isStarting() {
    return this.state === States.Starting;
  }

  get isRunning() {
    return this.state === States.Running;
  }

  get isStopping() {
    return this.state === States.Stopping;
  }

  get isStopped() {
    return this.state === States.Stopped;
  }

  transitionTo(state: States) {
    this.logger.debug(
      `[WorkerState] Starting transition to '${state}' (current state: ${this.state})`
    );

    if (this.state === state) {
      return;
    }

    if (Transitions[this.state].includes(state)) {
      this.state = state;
      this.logger.debug(`[WorkerState] Transitioned to '${state}'`);
    } else {
      throw new TransitionError({
        from: this.state,
        to: state,
      });
    }
  }
}

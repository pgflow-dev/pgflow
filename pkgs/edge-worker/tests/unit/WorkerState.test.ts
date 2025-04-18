import { describe, it, expect } from 'vitest';
import {
  WorkerState,
  States,
  TransitionError,
} from '../../src/core/WorkerState.js';
import { createLoggingFactory } from '../../src/platform/logging.js';

const loggingFactory = createLoggingFactory();
loggingFactory.setLogLevel('info');
const logger = loggingFactory.createLogger('WorkerState');

describe('WorkerState', () => {
  it('initial state should be Created', () => {
    const state = new WorkerState(logger);
    expect(state.current).toEqual(States.Created);
    expect(state.isCreated).toBeTruthy();
  });

  it('handles valid state transitions', () => {
    const state = new WorkerState(logger);

    // Created -> Starting
    state.transitionTo(States.Starting);
    expect(state.current).toEqual(States.Starting);
    expect(state.isStarting).toBeTruthy();

    // Starting -> Running
    state.transitionTo(States.Running);
    expect(state.current).toEqual(States.Running);
    expect(state.isRunning).toBeTruthy();

    // Running -> Stopping
    state.transitionTo(States.Stopping);
    expect(state.current).toEqual(States.Stopping);
    expect(state.isStopping).toBeTruthy();

    // Stopping -> Stopped
    state.transitionTo(States.Stopped);
    expect(state.current).toEqual(States.Stopped);
  });

  it('throws on invalid state transitions', () => {
    const state = new WorkerState(logger);

    // Cannot transition from Created to Running
    expect(() => {
      state.transitionTo(States.Running);
    }).toThrow(TransitionError);
    expect(() => {
      state.transitionTo(States.Running);
    }).toThrow('Cannot transition from created to running');

    // Cannot transition from Created to Stopped
    expect(() => {
      state.transitionTo(States.Stopped);
    }).toThrow(TransitionError);
    expect(() => {
      state.transitionTo(States.Stopped);
    }).toThrow('Cannot transition from created to stopped');
  });

  it('transitioning to same state should be no-op', () => {
    const state = new WorkerState(logger);

    // Transition to Starting first
    state.transitionTo(States.Starting);
    expect(state.current).toEqual(States.Starting);

    // Transition to Starting again
    state.transitionTo(States.Starting);
    expect(state.current).toEqual(States.Starting);
  });

  it('state getters work correctly', () => {
    const state = new WorkerState(logger);

    expect(state.isCreated).toBeTruthy();
    expect(state.isStarting).toBeFalsy();
    expect(state.isRunning).toBeFalsy();
    expect(state.isStopping).toBeFalsy();
  });
});

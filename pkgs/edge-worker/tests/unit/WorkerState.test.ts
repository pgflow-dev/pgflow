import { assertEquals, assertThrows } from '@std/assert';
import { WorkerState, States, TransitionError } from '../../src/core/WorkerState.ts';

Deno.test('WorkerState - initial state should be Created', () => {
  const state = new WorkerState();
  assertEquals(state.current, States.Created);
  assertEquals(state.isCreated, true);
});

Deno.test('WorkerState - valid state transitions', () => {
  const state = new WorkerState();

  // Created -> Starting
  state.transitionTo(States.Starting);
  assertEquals(state.current, States.Starting);
  assertEquals(state.isStarting, true);

  // Starting -> Running
  state.transitionTo(States.Running);
  assertEquals(state.current, States.Running);
  assertEquals(state.isRunning, true);

  // Running -> Stopping
  state.transitionTo(States.Stopping);
  assertEquals(state.current, States.Stopping);
  assertEquals(state.isStopping, true);

  // Stopping -> Stopped
  state.transitionTo(States.Stopped);
  assertEquals(state.current, States.Stopped);
});

Deno.test('WorkerState - invalid state transitions should throw', () => {
  const state = new WorkerState();

  // Cannot transition from Created to Running
  assertThrows(
    () => {
      state.transitionTo(States.Running);
    },
    TransitionError,
    'Cannot transition from created to running'
  );

  // Cannot transition from Created to Stopped
  assertThrows(
    () => {
      state.transitionTo(States.Stopped);
    },
    TransitionError,
    'Cannot transition from created to stopped'
  );
});

Deno.test('WorkerState - transitioning to same state should be no-op', () => {
  const state = new WorkerState();

  // Transition to Starting first
  state.transitionTo(States.Starting);
  assertEquals(state.current, States.Starting);

  // Transition to Starting again
  state.transitionTo(States.Starting);
  assertEquals(state.current, States.Starting);
});

Deno.test('WorkerState - state getters', () => {
  const state = new WorkerState();

  assertEquals(state.isCreated, true);
  assertEquals(state.isStarting, false);
  assertEquals(state.isRunning, false);
  assertEquals(state.isStopping, false);
});

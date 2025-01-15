import { assertEquals, assertRejects } from '@std/assert';
import { WorkerState, States, TransitionError } from '../../src/WorkerState.ts';

Deno.test('WorkerState - initial state should be Created', () => {
  const state = new WorkerState();
  assertEquals(state.current, States.Created);
  assertEquals(state.isCreated, true);
});

Deno.test('WorkerState - valid state transitions', async () => {
  const state = new WorkerState();

  // Created -> Starting
  await state.transitionTo(States.Starting);
  assertEquals(state.current, States.Starting);
  assertEquals(state.isStarting, true);

  // Starting -> Running
  await state.transitionTo(States.Running);
  assertEquals(state.current, States.Running);
  assertEquals(state.isRunning, true);

  // Running -> Stopping
  await state.transitionTo(States.Stopping);
  assertEquals(state.current, States.Stopping);
  assertEquals(state.isStopping, true);

  // Stopping -> Stopped
  await state.transitionTo(States.Stopped);
  assertEquals(state.current, States.Stopped);
});

Deno.test('WorkerState - invalid state transitions should throw', async () => {
  const state = new WorkerState();

  // Cannot transition from Created to Running
  await assertRejects(
    async () => {
      await state.transitionTo(States.Running);
    },
    TransitionError,
    'Cannot transition from created to running'
  );

  // Cannot transition from Created to Stopped
  await assertRejects(
    async () => {
      await state.transitionTo(States.Stopped);
    },
    TransitionError,
    'Cannot transition from created to stopped'
  );
});

Deno.test('WorkerState - transition with callback', async () => {
  const state = new WorkerState();
  let callbackExecuted = false;

  await state.transitionTo(States.Starting, async () => {
    callbackExecuted = true;
  });

  assertEquals(state.current, States.Starting);
  assertEquals(callbackExecuted, true);
});

Deno.test(
  'WorkerState - transition with failing callback should throw',
  async () => {
    const state = new WorkerState();

    await assertRejects(
      async () => {
        await state.transitionTo(States.Starting, async () => {
          throw new Error('Callback failed');
        });
      },
      Error,
      'Callback failed'
    );
  }
);

Deno.test(
  'WorkerState - transitioning to same state should be no-op',
  async () => {
    const state = new WorkerState();

    // Transition to Starting first
    await state.transitionTo(States.Starting);
    assertEquals(state.current, States.Starting);

    // Transition to Starting again
    await state.transitionTo(States.Starting);
    assertEquals(state.current, States.Starting);
  }
);

Deno.test('WorkerState - state getters', () => {
  const state = new WorkerState();

  assertEquals(state.isCreated, true);
  assertEquals(state.isStarting, false);
  assertEquals(state.isRunning, false);
  assertEquals(state.isStopping, false);
});

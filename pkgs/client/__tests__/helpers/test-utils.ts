import { vi, expect, beforeEach, afterEach } from 'vitest';
import {
  mockSupabase,
  mockChannelSubscription,
  resetMocks as resetAllMocks,
} from '../mocks';
import type {
  BroadcastRunEvent,
  BroadcastStepEvent,
  FlowRunStatus,
  FlowStepStatus,
} from '../../src/lib/types';
import type { RunRow, StepStateRow } from '@pgflow/core';

/**
 * Standard test setup that should be used in beforeEach/afterEach hooks
 */
export function setupTestEnvironment() {
  // Enable fake timers before *each* individual test
  beforeEach(() => {
    vi.useFakeTimers();
  });

  // Restore everything after the test finished
  afterEach(async () => {
    // Clear all timers without running them to avoid unhandled promise rejections
    vi.clearAllTimers();         // remove timeouts/intervals
    
    // Flush any pending promises to ensure they're handled
    // First await: Flushes the current microtask queue (processes promises already scheduled)
    await Promise.resolve();
    // Second await: Catches any promise rejections triggered by the first flush
    // (rejection handlers are themselves queued as microtasks)
    await Promise.resolve();
    
    resetAllMocks();             // reset our custom mocks
    vi.useRealTimers();          // go back to real time for the next test
  });
}

/**
 * Creates a fully configured mock Supabase client with standard test defaults
 */
export function createMockClient(
  options: {
    subscriptionDelay?: number;
    shouldFailSubscription?: boolean;
  } = {}
) {
  const { client, mocks } = mockSupabase();

  // Apply standard channel subscription behavior
  mockChannelSubscription(mocks, {
    delayMs: options.subscriptionDelay ?? 0,
    shouldFail: options.shouldFailSubscription ?? false,
  });

  return { client, mocks };
}


/**
 * Helper to emit broadcast events to a channel
 */
export function emitBroadcastEvent(
  mocks: ReturnType<typeof mockSupabase>['mocks'],
  eventType: string,
  payload: BroadcastRunEvent | BroadcastStepEvent
) {
  const broadcastHandler = mocks.channel.handlers.get('*');
  if (!broadcastHandler) {
    throw new Error(
      'No broadcast handler found - ensure channel is subscribed'
    );
  }

  broadcastHandler({
    event: eventType,
    payload,
  });
}

/**
 * Helper to emit system events to a channel
 */
export function emitSystemEvent(
  mocks: ReturnType<typeof mockSupabase>['mocks'],
  eventType: string,
  payload?: any
) {
  const systemHandler = mocks.channel.systemHandlers.get(eventType);
  if (!systemHandler) {
    throw new Error(`No system handler found for event: ${eventType}`);
  }

  systemHandler(payload);
}

/**
 * Creates a standard RPC response for getRun/startFlow
 */
export function createRunResponse(
  run: Partial<RunRow>,
  steps: Partial<StepStateRow>[] = []
): { data: { run: RunRow; steps: StepStateRow[] }; error: null } {
  const defaultRun: RunRow = {
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    flow_slug: 'test-flow',
    status: 'started',
    input: { foo: 'bar' },
    output: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    failed_at: null,
    remaining_steps: steps.length,
    ...run,
  };

  const defaultSteps: StepStateRow[] = steps.map((step, index) => ({
    run_id: defaultRun.run_id,
    step_slug: `step-${index}`,
    status: 'created',
    started_at: null,
    completed_at: null,
    failed_at: null,
    error_message: null,
    created_at: new Date().toISOString(),
    flow_slug: defaultRun.flow_slug,
    remaining_deps: 0,
    remaining_tasks: 1,
    ...step,
  }));

  return {
    data: {
      run: defaultRun,
      steps: defaultSteps,
    },
    error: null,
  };
}

/**
 * Sets up a mock RPC call with a standard response
 */
export function mockRpcCall(
  mocks: ReturnType<typeof mockSupabase>['mocks'],
  response: any
) {
  mocks.rpc.mockReturnValueOnce(response);
}

/**
 * Sets up multiple mock RPC calls
 */
export function mockRpcCalls(
  mocks: ReturnType<typeof mockSupabase>['mocks'],
  responses: any[]
) {
  responses.forEach((response) => {
    mocks.rpc.mockReturnValueOnce(response);
  });
}

/**
 * Helper to track events emitted on a callback
 *
 * This tracker focuses on data collection and queries only.
 * For assertions, use the custom matchers (toHaveReceivedEvent, etc.)
 */
export function createEventTracker<T extends { event_type: string }>() {
  const events: T[] = [];
  const callback = vi.fn((event: T) => {
    events.push(event);
  });

  return {
    // Core
    callback,
    events,

    // Query methods - return data for further use
    getEventTypes: () => events.map((e) => e.event_type),
    getLastEvent: () => events[events.length - 1],
    findByType: (type: string) => events.filter((e) => e.event_type === type),
    countByType: (type: string) => events.filter((e) => e.event_type === type).length,
    hasEventType: (type: string) => events.some((e) => e.event_type === type),
    getFirstByType: (type: string) => events.find((e) => e.event_type === type),
    getSequence: () => events.map((e) => e.event_type),

    findByPayload: (matcher: Partial<T>) =>
      events.filter((e) =>
        Object.entries(matcher).every(([key, value]) => e[key as keyof T] === value)
      ),

    getEventsBetween: (startType: string, endType: string) => {
      const startIndex = events.findIndex((e) => e.event_type === startType);
      const endIndex = events.findIndex((e) => e.event_type === endType);

      if (startIndex === -1 || endIndex === -1) {
        return [];
      }

      return events.slice(startIndex + 1, endIndex);
    },

    // Utility
    clear: () => {
      events.length = 0;
      callback.mockClear();
    },

    // Debug helpers
    debug: () => {
      console.log('=== Event Tracker Debug ===');
      console.log(`Total events: ${events.length}`);
      events.forEach((event, index) => {
        console.log(`[${index}] ${event.event_type}:`, event);
      });
    },

    getSummary: () => {
      const typeCounts = events.reduce((acc, e) => {
        acc[e.event_type] = (acc[e.event_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        total: events.length,
        types: Object.keys(typeCounts).length,
        breakdown: typeCounts,
      };
    },
  };
}

export type EventTracker<T extends { event_type: string }> = ReturnType<typeof createEventTracker<T>>;

/**
 * Advances timers and flushes all pending microtasks
 */
export async function advanceTimersAndFlush(ms: number): Promise<void> {
  // Advance *only* the requested time, then flush micro-tasks.
  try {
    await vi.advanceTimersByTimeAsync(ms);
  } catch {
    vi.advanceTimersByTime(ms);
  }
  // Flush pending micro-tasks (promises) without triggering later timers
  // First await: Processes promises that were resolved by the timer advancement
  await Promise.resolve();
  // Second await: Ensures any promise rejections from the first flush are handled
  // (prevents "Unhandled promise rejection" warnings in tests)
  await Promise.resolve();
}

/**
 * Creates a synchronous schedule function for testing (bypasses setTimeout)
 * Use this when creating adapters/clients to avoid fake timer issues
 */
export function createSyncSchedule() {
  return (callback: () => void, _delay: number) => {
    callback();
    return 0 as any; // Return value doesn't matter for tests
  };
}

/**
 * Creates a test scenario for verifying event routing
 */
export function createEventRoutingTest(options: {
  eventType: string;
  payload: BroadcastRunEvent | BroadcastStepEvent;
  expectedCallbackType: 'run' | 'step';
}) {
  return async (
    adapter: any,
    mocks: ReturnType<typeof mockSupabase>['mocks']
  ) => {
    const runTracker = createEventTracker<BroadcastRunEvent>();
    const stepTracker = createEventTracker<BroadcastStepEvent>();

    adapter.onRunEvent(runTracker.callback);
    adapter.onStepEvent(stepTracker.callback);

    // Subscribe and emit event
    await adapter.subscribeToRun(options.payload.run_id);
    emitBroadcastEvent(mocks, options.eventType, options.payload);

    // Verify correct callback was called
    if (options.expectedCallbackType === 'run') {
      expect(runTracker.events).toHaveLength(1);
      expect(runTracker.getLastEvent()).toEqual(options.payload);
      expect(stepTracker.events).toHaveLength(0);
    } else {
      expect(stepTracker.events).toHaveLength(1);
      expect(stepTracker.getLastEvent()).toEqual(options.payload);
      expect(runTracker.events).toHaveLength(0);
    }
  };
}

/**
 * Helper to verify that a state transition was accepted or rejected
 */
export function expectStateTransition(
  entity: { status: FlowRunStatus | FlowStepStatus },
  updateFn: () => boolean,
  expectedAccepted: boolean,
  expectedStatus?: FlowRunStatus | FlowStepStatus
) {
  const result = updateFn();
  expect(result).toBe(expectedAccepted);

  if (expectedStatus !== undefined) {
    expect(entity.status).toBe(expectedStatus);
  }
}

/**
 * Creates a UUID mock that returns sequential IDs
 */
export function mockSequentialUuids(prefix = 'run') {
  let callCount = 0;
  return vi.fn(() => `${prefix}-${++callCount}`);
}

/**
 * Helper to set up concurrent operation tests
 */
export async function setupConcurrentOperations<T>(
  operations: (() => Promise<T>)[]
): Promise<{
  results: PromiseSettledResult<T>[];
  succeeded: T[];
  failed: any[];
}> {
  // Invoke each operation first
  const results = await Promise.allSettled(operations.map(op => op()));

  const succeeded = results
    .filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled')
    .map((r) => r.value);

  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => r.reason);

  return { results, succeeded, failed };
}

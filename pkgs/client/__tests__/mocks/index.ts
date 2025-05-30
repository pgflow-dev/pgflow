import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type {
  RealtimeChannel,
  SupabaseClient,
  RealtimeChannelOptions,
} from '@supabase/supabase-js';
import type {
  BroadcastRunEvent,
  BroadcastStepEvent,
} from '../../src/lib/types';

/**
 * Global state for singleton/shared test state
 * Managing this as a global allows us to check cross-instance behavior and reset between tests
 */
interface GlobalTestState {
  runs: Map<string, unknown>;
  steps: Map<string, unknown>;
  channelSubscriptions: Map<string, boolean>;
  broadcastCallbacks: {
    runEvents: ((event: BroadcastRunEvent) => void)[];
    stepEvents: ((event: BroadcastStepEvent) => void)[];
  };
}

const globalTestState: GlobalTestState = {
  runs: new Map(),
  steps: new Map(),
  channelSubscriptions: new Map(),
  broadcastCallbacks: {
    runEvents: [],
    stepEvents: [],
  },
};

/**
 * Supabase client type with mock channel for proper typing
 */
type SupabaseClientWithMockChannel = SupabaseClient & {
  channel: Mock<[name: string, opts?: RealtimeChannelOptions], RealtimeChannel>;
};

/**
 * Helper to create a setTimeout-compatible mock function
 */
export function createMockSchedule() {
  const calls: Array<{ delay: number; callback: () => void }> = [];

  const impl = (cb: () => void, delay: number) => {
    calls.push({ delay, callback: cb });
    return setTimeout(cb, delay);
  };

  // Create spy and add missing __promisify__ property
  const spy = Object.assign(vi.fn(impl), {
    __promisify__: vi.fn(),
  }) as unknown as typeof setTimeout;

  return { spy, calls };
}

/**
 * Fully mocked Supabase client with tracked calls
 */
export function mockSupabase(): {
  client: SupabaseClientWithMockChannel;
  mocks: Record<string, any>;
} {
  // Create an RPC mock returning response with data and error properties
  const rpcMock = vi.fn().mockReturnValue({
    data: null,
    error: null,
  });

  // Create a query builder mock for select/insert/update operations
  const queryBuilderMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue({
      data: null,
      error: null,
    }),
    order: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    execute: vi.fn().mockReturnValue({
      data: null,
      error: null,
    }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    and: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    containedBy: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    textSearch: vi.fn().mockReturnThis(),
  };

  // Create the from function that will be called multiple times
  const fromMock = vi.fn().mockReturnValue(queryBuilderMock);

  // Create a schema function that returns the query builder
  const schemaMock = vi.fn().mockReturnValue({
    rpc: rpcMock,
    from: fromMock,
  });

  // Create a channel mock
  const channelMock = mockRealtimeChannel();

  // Create channel spy with proper typing
  const channelSpy = vi
    .fn<[string, RealtimeChannelOptions?], RealtimeChannel>()
    .mockReturnValue(channelMock.channel);

  // Actual client mock
  const supabaseMock = {
    schema: schemaMock,
    channel: channelSpy,
    // Add common Supabase methods that might be used in other parts of the client
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi
          .fn()
          .mockResolvedValue({ data: { path: 'test-file-path' }, error: null }),
        download: vi
          .fn()
          .mockResolvedValue({ data: new Blob([], {}), error: null }),
      }),
    },
  } as unknown as SupabaseClientWithMockChannel;

  return {
    client: supabaseMock,
    mocks: {
      schema: schemaMock,
      rpc: rpcMock,
      queryBuilder: queryBuilderMock,
      channel: channelMock,
      globalState: globalTestState,
    },
  };
}

/**
 * Creates a mock for the Supabase Realtime Channel
 * Allows tracking broadcast messages and system events
 */
export function mockRealtimeChannel(): {
  channel: RealtimeChannel;
  handlers: Map<string, (payload: any) => void>;
  systemHandlers: Map<string, (payload: any) => void>;
  sendBroadcast: (eventType: string, payload: any) => void;
  sendSystemEvent: (eventType: string, payload: any) => void;
} {
  // Store event handlers to allow triggering them in tests
  const handlers = new Map<string, (payload: any) => void>();
  const systemHandlers = new Map<string, (payload: any) => void>();

  // Create mock channel with defined behaviors
  const channelMock = {} as any;

  // Define methods - handle both 2-arg and 3-arg forms
  channelMock.on = vi
    .fn()
    .mockImplementation((type, eventOrCallback, maybeHandler) => {
      if (type === 'broadcast') {
        if (typeof eventOrCallback === 'function') {
          // 2-argument form: type, callback
          handlers.set('*', eventOrCallback);
        } else if (typeof eventOrCallback === 'object' && maybeHandler) {
          // 3-argument form: type, { event }, handler
          handlers.set(eventOrCallback.event, maybeHandler);
        }
      } else if (type === 'system') {
        if (typeof eventOrCallback === 'function') {
          // 2-argument form: type, callback for system events
          systemHandlers.set('*', eventOrCallback);
        } else if (typeof eventOrCallback === 'object' && maybeHandler) {
          systemHandlers.set(eventOrCallback.event, maybeHandler);
        } else if (
          typeof eventOrCallback === 'string' &&
          typeof maybeHandler === 'function'
        ) {
          // Direct event name as string
          systemHandlers.set(eventOrCallback, maybeHandler);
        }
      }
      return channelMock;
    });

  // Track subscription state
  channelMock.subscribe = vi.fn().mockImplementation(() => {
    if (channelMock.channelName) {
      globalTestState.channelSubscriptions.set(channelMock.channelName, true);
    }
    return channelMock;
  });

  // Track unsubscription state
  channelMock.unsubscribe = vi.fn().mockImplementation(() => {
    if (channelMock.channelName) {
      globalTestState.channelSubscriptions.set(channelMock.channelName, false);
    }
    return channelMock;
  });

  // Add capability to send events
  const sendBroadcast = (eventType: string, payload: any) => {
    const handler = handlers.get('*') || handlers.get(eventType);
    if (handler) {
      handler({ event: eventType, payload });
    }
  };

  const sendSystemEvent = (eventType: string, payload: any) => {
    const handler = systemHandlers.get(eventType);
    if (handler) {
      handler(payload);
    }
  };

  return {
    channel: channelMock as RealtimeChannel,
    handlers,
    systemHandlers,
    sendBroadcast,
    sendSystemEvent,
  };
}

/**
 * Helper to send broadcast events to an active channel
 * Automatically formats the payload with proper event_type
 */
export function emitBroadcastEvent(
  channelMock: any,
  eventType: string,
  payload: any
): void {
  const handler = channelMock.handlers.get('*');
  if (handler) {
    // Ensure eventType is correctly formatted for broadcast
    const fullPayload = {
      ...payload,
      event_type: eventType,
    };
    handler({ event: eventType, payload: fullPayload });
  }
}

/**
 * Registers a mock callback for run events in the global state
 */
export function registerRunEventCallback(
  callback: (event: BroadcastRunEvent) => void
): () => void {
  globalTestState.broadcastCallbacks.runEvents.push(callback);

  return () => {
    const index =
      globalTestState.broadcastCallbacks.runEvents.indexOf(callback);
    if (index !== -1) {
      globalTestState.broadcastCallbacks.runEvents.splice(index, 1);
    }
  };
}

/**
 * Registers a mock callback for step events in the global state
 */
export function registerStepEventCallback(
  callback: (event: BroadcastStepEvent) => void
): () => void {
  globalTestState.broadcastCallbacks.stepEvents.push(callback);

  return () => {
    const index =
      globalTestState.broadcastCallbacks.stepEvents.indexOf(callback);
    if (index !== -1) {
      globalTestState.broadcastCallbacks.stepEvents.splice(index, 1);
    }
  };
}

/**
 * Triggers run event callbacks registered in the global state
 */
export function triggerRunEvent(event: BroadcastRunEvent): void {
  globalTestState.broadcastCallbacks.runEvents.forEach((callback) =>
    callback(event)
  );
}

/**
 * Triggers step event callbacks registered in the global state
 */
export function triggerStepEvent(event: BroadcastStepEvent): void {
  globalTestState.broadcastCallbacks.stepEvents.forEach((callback) =>
    callback(event)
  );
}

/**
 * Helper to setup realistic channel subscription behavior for tests
 *
 * @param mocks - The mocks object returned from mockSupabase()
 * @param options - Configuration options
 * @param options.delayMs - Delay before subscription succeeds (default: 0 for immediate)
 * @param options.shouldFail - Whether subscription should fail (default: false)
 * @param options.failureMessage - Error message if subscription fails
 */
export function mockChannelSubscription(
  mocks: ReturnType<typeof mockSupabase>['mocks'],
  options: {
    delayMs?: number;
    shouldFail?: boolean;
    failureMessage?: string;
  } = {}
): void {
  const { delayMs = 0, shouldFail = false } = options;

  mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
    if (callback) {
      if (delayMs > 0) {
        setTimeout(() => {
          if (shouldFail) {
            callback('CHANNEL_ERROR');
          } else {
            callback('SUBSCRIBED');
          }
        }, delayMs);
      } else {
        // Immediate execution for faster tests
        if (shouldFail) {
          callback('CHANNEL_ERROR');
        } else {
          callback('SUBSCRIBED');
        }
      }
    }
    return mocks.channel.channel;
  });
}

/**
 * Reset all mocks and global test state between tests
 */
export function resetMocks(): void {
  vi.restoreAllMocks();
  vi.clearAllMocks();

  // Clear global test state
  globalTestState.runs.clear();
  globalTestState.steps.clear();
  globalTestState.channelSubscriptions.clear();
  globalTestState.broadcastCallbacks.runEvents = [];
  globalTestState.broadcastCallbacks.stepEvents = [];
}

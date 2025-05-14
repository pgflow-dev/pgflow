import { vi } from 'vitest';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client
export function mockSupabase(): { client: SupabaseClient; mocks: Record<string, any> } {
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

  // Actual client mock
  const supabaseMock = {
    schema: schemaMock,
    channel: vi.fn().mockReturnValue(channelMock.channel),
  } as unknown as SupabaseClient;

  return {
    client: supabaseMock,
    mocks: {
      schema: schemaMock,
      rpc: rpcMock,
      queryBuilder: queryBuilderMock,
      channel: channelMock,
    },
  };
}

// Mock Realtime Channel
export function mockRealtimeChannel(): { 
  channel: RealtimeChannel; 
  handlers: Map<string, (payload: any) => void>;
  systemHandlers: Map<string, (payload: any) => void>;
} {
  // Store event handlers to allow triggering them in tests
  const handlers = new Map<string, (payload: any) => void>();
  const systemHandlers = new Map<string, (payload: any) => void>();

  // Create mock channel with defined behaviors
  const channelMock = {} as any;
  
  // Define methods
  channelMock.on = vi.fn().mockImplementation((type, { event }, handler) => {
    if (type === 'broadcast') {
      handlers.set(event, handler);
    } else if (type === 'system') {
      systemHandlers.set(event, handler);
    }
    return channelMock;
  });
  
  channelMock.subscribe = vi.fn().mockReturnValue(channelMock);
  channelMock.unsubscribe = vi.fn().mockReturnValue(channelMock);

  return { 
    channel: channelMock as RealtimeChannel, 
    handlers, 
    systemHandlers 
  };
}

// Reset all mocks between tests
export function resetMocks(): void {
  vi.restoreAllMocks();
  vi.clearAllMocks();
}
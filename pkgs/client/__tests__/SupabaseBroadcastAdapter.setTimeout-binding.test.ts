import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseBroadcastAdapter } from '../src/lib/SupabaseBroadcastAdapter.js';
import { createClient } from '@supabase/supabase-js';

describe('SupabaseBroadcastAdapter - setTimeout binding issue', () => {
  const supabaseUrl = 'https://test.supabase.co';
  const supabaseKey = 'test-key';

  it('should handle setTimeout without losing context (browser environment)', async () => {
    // Simulate browser environment where setTimeout can lose context when assigned
    const originalSetTimeout = globalThis.setTimeout;

    // This simulates what happens in browsers - setTimeout needs to be called
    // with the correct context (window/globalThis)
    const unboundSetTimeout = function(this: unknown, callback: () => void, delay: number) {
      // If 'this' is not the global object, it will fail in strict mode browsers
      if (this !== globalThis && this !== undefined) {
        throw new TypeError("'setTimeout' called on an object that does not implement interface Window.");
      }
      return originalSetTimeout(callback, delay);
    };

    // Replace setTimeout temporarily to simulate browser behavior
    const setTimeoutSpy = vi.fn(unboundSetTimeout);
    globalThis.setTimeout = setTimeoutSpy as unknown as typeof setTimeout;

    try {
      // Create adapter - this will assign setTimeout to #schedule
      const supabase = createClient(supabaseUrl, supabaseKey);
      const adapter = new SupabaseBroadcastAdapter(supabase, {
        reconnectDelayMs: 100,
        stabilizationDelayMs: 100,
      });

      // Create a mock channel that triggers error callback
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((callback: (status: string) => void) => {
          // Trigger error to invoke #handleChannelError which uses this.#schedule
          setTimeout(() => {
            const errorHandler = mockChannel.on.mock.calls.find(
              (call) => call[0] === 'system' && call[1]?.event === 'error'
            )?.[2];
            if (errorHandler) {
              errorHandler({ error: new Error('Test error') });
            }
          }, 10);

          // Also trigger subscribed
          setTimeout(() => callback('SUBSCRIBED'), 10);
          return mockChannel;
        }),
        unsubscribe: vi.fn(),
      };

      // Mock supabase.channel to return our mock
      supabase.channel = vi.fn().mockReturnValue(mockChannel);

      // This should work without throwing "setTimeout called on an object..."
      await expect(
        adapter.subscribeToRun('test-run-id')
      ).resolves.toBeDefined();

      // Verify setTimeout was called (should be called for stabilization delay)
      expect(setTimeoutSpy).toHaveBeenCalled();
    } finally {
      // Restore original setTimeout
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('should work with custom schedule function', async () => {
    const customSchedule = vi.fn((callback: () => void, delay: number) => {
      return setTimeout(callback, delay);
    });

    const supabase = createClient(supabaseUrl, supabaseKey);
    const adapter = new SupabaseBroadcastAdapter(supabase, {
      schedule: customSchedule as unknown as typeof setTimeout,
      stabilizationDelayMs: 10,
    });

    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback: (status: string) => void) => {
        setTimeout(() => callback('SUBSCRIBED'), 5);
        return mockChannel;
      }),
      unsubscribe: vi.fn(),
    };

    supabase.channel = vi.fn().mockReturnValue(mockChannel);

    await adapter.subscribeToRun('test-run-id');

    // Custom schedule should be used
    expect(customSchedule).toHaveBeenCalled();
  });
});

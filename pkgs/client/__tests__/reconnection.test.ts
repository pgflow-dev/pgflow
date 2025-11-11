import { describe, it, expect, vi } from 'vitest';
import { SupabaseBroadcastAdapter } from '../src/lib/SupabaseBroadcastAdapter';
import {
  setupTestEnvironment,
  createMockClient,
  mockRpcCall,
  createRunResponse,
  createSyncSchedule,
} from './helpers/test-utils';
import {
  createMockSchedule,
} from './mocks';
import { RUN_ID, startedRunSnapshot, stepStatesSample } from './fixtures';

describe('Reconnection Logic', () => {
  setupTestEnvironment();

  describe('Basic Error Handling', () => {
    it('registers error handlers during subscription', async () => {
      const { client, mocks } = createMockClient();

      mocks.rpc.mockReturnValue({
        data: { run: startedRunSnapshot, steps: stepStatesSample },
        error: null,
      });

      // Mock successful subscription
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, { stabilizationDelayMs: 0, schedule: createSyncSchedule() });
      
      // Subscribe to run
      const unsubscribe = await adapter.subscribeToRun(RUN_ID);

      // Verify error handler was registered
      expect(mocks.channel.systemHandlers.has('error')).toBe(true);

      unsubscribe();
    });

    it('schedules reconnection when error occurs', async () => {
      const { client, mocks } = createMockClient();
      const { spy: mockSchedule } = createMockSchedule();

      mocks.rpc.mockReturnValue({
        data: { run: startedRunSnapshot, steps: stepStatesSample },
        error: null,
      });

      // Mock successful subscription
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: 1000,
        stabilizationDelayMs: 0,
        schedule: mockSchedule,
      });

      // Subscribe to run (need to advance timers for setTimeout(..., 0))
      const subscribePromise = adapter.subscribeToRun(RUN_ID);
      await vi.runAllTimersAsync();
      const unsubscribe = await subscribePromise;

      // Trigger error handler
      const errorHandler = mocks.channel.systemHandlers.get('error');
      expect(errorHandler).toBeDefined();
      errorHandler?.({ error: new Error('Test error') });

      // Verify schedule was called with correct delay
      expect(mockSchedule).toHaveBeenCalledWith(
        expect.any(Function),
        1000
      );

      unsubscribe();
    });

    it('uses configurable reconnection delay', async () => {
      const { client, mocks } = createMockClient();
      const { spy: mockSchedule } = createMockSchedule();
      const customDelay = 5000;

      mocks.rpc.mockReturnValue({
        data: { run: startedRunSnapshot, steps: stepStatesSample },
        error: null,
      });

      // Mock successful subscription
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: customDelay,
        stabilizationDelayMs: 0,
        schedule: mockSchedule,
      });

      // Subscribe to run (need to advance timers for setTimeout(..., 0))
      const subscribePromise = adapter.subscribeToRun(RUN_ID);
      await vi.runAllTimersAsync();
      const unsubscribe = await subscribePromise;

      // Trigger error handler
      const errorHandler = mocks.channel.systemHandlers.get('error');
      errorHandler?.({ error: new Error('Test error') });

      // Verify custom delay was used
      expect(mockSchedule).toHaveBeenCalledWith(
        expect.any(Function),
        customDelay
      );

      unsubscribe();
    });
  });

  // NOTE: Complex reconnection scenarios like actual channel recreation,
  // state refresh during reconnection, and network resilience are tested
  // in the integration tests at __tests__/integration/reconnection.test.ts
  // and __tests__/integration/network-resilience.test.ts
  //
  // This approach provides more reliable testing since integration tests
  // use real Supabase clients and don't suffer from timing issues that
  // occur with complex mocks in different environments (local vs CI).
});
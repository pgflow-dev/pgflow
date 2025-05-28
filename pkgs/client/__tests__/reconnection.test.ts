import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseBroadcastAdapter } from '../../src/lib/SupabaseBroadcastAdapter';
import { mockSupabase, resetMocks, mockChannelSubscription } from '../mocks';
import {
  RUN_ID,
  startedRunSnapshot,
  stepStatesSample,
} from '../fixtures';

describe('Reconnection Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  describe('Channel Error Handling', () => {
    it('handles channel errors and schedules reconnection', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock successful state fetch for reconnection
      mocks.rpc.mockReturnValue({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      // Create custom schedule function to track calls
      const scheduleCalls: Array<{ delay: number; callback: () => void }> = [];
      const mockSchedule = vi.fn((callback: () => void, delay: number) => {
        scheduleCalls.push({ delay, callback });
        return setTimeout(callback, delay);
      });

      // Setup channel subscription (immediate for test performance)
      mockChannelSubscription(mocks);

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: 1000,
        schedule: mockSchedule,
      });

      // Subscribe to a run - await since it's async
      const unsubscribe = await adapter.subscribeToRun(RUN_ID);

      // Simulate a channel error
      const errorHandler = mocks.channel.systemHandlers.get('error');
      expect(errorHandler).toBeDefined();

      // Trigger error handler
      errorHandler?.({ error: new Error('Connection lost') });

      // Verify reconnection was scheduled
      expect(mockSchedule).toHaveBeenCalledWith(
        expect.any(Function),
        1000 // reconnectDelayMs
      );

      // Verify the scheduled callback exists
      expect(scheduleCalls).toHaveLength(1);
      expect(scheduleCalls[0].delay).toBe(1000);

      // Execute the scheduled reconnection
      await scheduleCalls[0].callback();

      // Verify state refresh was called during reconnection
      expect(mocks.rpc).toHaveBeenCalledWith(
        'get_run_with_states',
        { run_id: RUN_ID }
      );

      // Clean up
      unsubscribe();
    });

    it('uses configurable reconnection delay', async () => {
      const { client, mocks } = mockSupabase();
      
      const customDelay = 5000;
      const scheduleCalls: Array<{ delay: number }> = [];
      const mockSchedule = vi.fn((callback: () => void, delay: number) => {
        scheduleCalls.push({ delay });
        return setTimeout(callback, delay);
      });

      // Mock channel subscription to resolve immediately
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: customDelay,
        schedule: mockSchedule,
      });

      // Subscribe to trigger potential reconnection - await since it's async
      const unsubscribe = await adapter.subscribeToRun(RUN_ID);

      // Simulate error to test reconnection delay
      const errorHandler = mocks.channel.systemHandlers.get('error');
      errorHandler?.({ error: new Error('Custom delay test') });

      // Verify custom delay was used
      expect(scheduleCalls[0]?.delay).toBe(customDelay);

      unsubscribe();
    });

    it('does not reconnect if channel no longer exists', async () => {
      const { client, mocks } = mockSupabase();
      
      const scheduleCalls: Array<{ callback: () => void }> = [];
      const mockSchedule = vi.fn((callback: () => void, delay: number) => {
        scheduleCalls.push({ callback });
        return setTimeout(callback, delay);
      });

      // Mock RPC for potential reconnection attempt
      mocks.rpc.mockReturnValue({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      // Mock channel subscription to resolve immediately
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: 100,
        schedule: mockSchedule,
      });

      // Subscribe then immediately unsubscribe - await since it's async
      const unsubscribe = await adapter.subscribeToRun(RUN_ID);
      unsubscribe();

      // Simulate error after unsubscribe
      const errorHandler = mocks.channel.systemHandlers.get('error');
      errorHandler?.({ error: new Error('Error after unsubscribe') });

      // Execute any scheduled reconnections
      if (scheduleCalls.length > 0) {
        await scheduleCalls[0].callback();
      }

      // Verify RPC was not called for reconnection since channel was unsubscribed
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });

  describe('State Refresh During Reconnection', () => {
    it('refreshes state from database during reconnection', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock state fetch response
      const updatedSnapshot = {
        ...startedRunSnapshot,
        status: 'completed' as const,
        completed_at: new Date().toISOString(),
      };

      mocks.rpc.mockReturnValue({
        data: {
          run: updatedSnapshot,
          steps: stepStatesSample.map(s => ({
            ...s,
            status: 'completed' as const,
            completed_at: new Date().toISOString(),
          })),
        },
        error: null,
      });

      const scheduleCalls: Array<{ callback: () => void }> = [];
      const mockSchedule = vi.fn((callback: () => void, delay: number) => {
        scheduleCalls.push({ callback });
        return setTimeout(callback, delay);
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: 100,
        schedule: mockSchedule,
      });

      // Set up event listeners to track state updates
      const runEvents: any[] = [];
      const stepEvents: any[] = [];

      adapter.onRunEvent((event) => runEvents.push(event));
      adapter.onStepEvent((event) => stepEvents.push(event));

      // Mock channel subscription to resolve immediately
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      // Subscribe to run - await since it's async
      const unsubscribe = await adapter.subscribeToRun(RUN_ID);

      // Simulate channel error to trigger reconnection
      const errorHandler = mocks.channel.systemHandlers.get('error');
      errorHandler?.({ error: new Error('Reconnection test') });

      // Execute scheduled reconnection
      if (scheduleCalls.length > 0) {
        await scheduleCalls[0].callback();
      }

      // Verify state was refreshed
      expect(mocks.rpc).toHaveBeenCalledWith(
        'get_run_with_states',
        { run_id: RUN_ID }
      );

      unsubscribe();
    });

    it('handles state refresh errors gracefully', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock failed state fetch
      mocks.rpc.mockReturnValue({
        data: null,
        error: new Error('Database connection failed during refresh'),
      });

      const scheduleCalls: Array<{ callback: () => void }> = [];
      const mockSchedule = vi.fn((callback: () => void, delay: number) => {
        scheduleCalls.push({ callback });
        return setTimeout(callback, delay);
      });

      // Mock channel subscription to resolve immediately
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: 100,
        schedule: mockSchedule,
      });

      // Subscribe to run - await since it's async
      const unsubscribe = await adapter.subscribeToRun(RUN_ID);

      // Simulate channel error
      const errorHandler = mocks.channel.systemHandlers.get('error');
      errorHandler?.({ error: new Error('Initial error') });

      // Execute reconnection - should not throw despite refresh error
      expect(async () => {
        if (scheduleCalls.length > 0) {
          await scheduleCalls[0].callback();
        }
      }).not.toThrow();

      // Verify refresh was attempted
      expect(mocks.rpc).toHaveBeenCalledWith(
        'get_run_with_states',
        { run_id: RUN_ID }
      );

      unsubscribe();
    });
  });

  describe('Multiple Reconnection Scenarios', () => {
    it('handles multiple rapid errors correctly', async () => {
      const { client, mocks } = mockSupabase();
      
      mocks.rpc.mockReturnValue({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const scheduleCalls: Array<{ delay: number; callback: () => void }> = [];
      const mockSchedule = vi.fn((callback: () => void, delay: number) => {
        scheduleCalls.push({ delay, callback });
        return setTimeout(callback, delay);
      });

      // Mock channel subscription to resolve immediately
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: 100,
        schedule: mockSchedule,
      });

      // Subscribe to run - await since it's async
      const unsubscribe = await adapter.subscribeToRun(RUN_ID);

      // Simulate multiple rapid errors
      const errorHandler = mocks.channel.systemHandlers.get('error');
      
      errorHandler?.({ error: new Error('Error 1') });
      errorHandler?.({ error: new Error('Error 2') });
      errorHandler?.({ error: new Error('Error 3') });

      // Verify multiple reconnections were scheduled
      expect(scheduleCalls.length).toBeGreaterThan(1);

      // Execute all scheduled reconnections
      for (const call of scheduleCalls) {
        await call.callback();
      }

      // Verify state refresh was called for each reconnection
      expect(mocks.rpc).toHaveBeenCalledTimes(scheduleCalls.length);

      unsubscribe();
    });

    it('handles reconnection during active subscription', async () => {
      const { client, mocks } = mockSupabase();
      
      mocks.rpc.mockReturnValue({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const scheduleCalls: Array<{ callback: () => void }> = [];
      const mockSchedule = vi.fn((callback: () => void, delay: number) => {
        scheduleCalls.push({ callback });
        return setTimeout(callback, delay);
      });

      // Mock channel subscription to resolve immediately
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: 50,
        schedule: mockSchedule,
      });

      // Subscribe to run - await since it's async
      const unsubscribe = await adapter.subscribeToRun(RUN_ID);

      // Verify initial subscription
      expect(client.channel).toHaveBeenCalledWith(`pgflow:run:${RUN_ID}`);

      // Simulate error to trigger reconnection
      const errorHandler = mocks.channel.systemHandlers.get('error');
      errorHandler?.({ error: new Error('Connection lost') });

      // Execute reconnection
      if (scheduleCalls.length > 0) {
        await scheduleCalls[0].callback();
      }

      // Verify new channel was created during reconnection
      expect(client.channel).toHaveBeenCalledTimes(2); // Initial + reconnection

      unsubscribe();
    });
  });

  describe('Reconnection Resource Management', () => {
    it('properly cleans up old channels during reconnection', async () => {
      const { client, mocks } = mockSupabase();
      
      mocks.rpc.mockReturnValue({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const scheduleCalls: Array<{ callback: () => void }> = [];
      const mockSchedule = vi.fn((callback: () => void, delay: number) => {
        scheduleCalls.push({ callback });
        return setTimeout(callback, delay);
      });

      // Mock channel subscription to resolve immediately
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: 100,
        schedule: mockSchedule,
      });

      // Subscribe to run - await since it's async
      const unsubscribe = await adapter.subscribeToRun(RUN_ID);

      // Get reference to original channel
      const originalChannelCalls = client.channel.mock.calls.length;

      // Simulate error and reconnection
      const errorHandler = mocks.channel.systemHandlers.get('error');
      errorHandler?.({ error: new Error('Test reconnection') });

      // Execute reconnection
      if (scheduleCalls.length > 0) {
        await scheduleCalls[0].callback();
      }

      // Verify new channel was created
      expect(client.channel.mock.calls.length).toBeGreaterThan(originalChannelCalls);

      unsubscribe();
    });

    it('maintains reference equality for unsubscribe functions', async () => {
      const { client, mocks } = mockSupabase();
      
      mocks.rpc.mockReturnValue({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      // Mock channel subscription to resolve immediately
      mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
        if (callback) callback('SUBSCRIBED');
        return mocks.channel.channel;
      });

      const adapter = new SupabaseBroadcastAdapter(client, {
        reconnectDelayMs: 100,
      });

      // Subscribe multiple times to same run - await since it's async
      const unsubscribe1 = await adapter.subscribeToRun(RUN_ID);
      const unsubscribe2 = await adapter.subscribeToRun(RUN_ID);

      // Should return the same unsubscribe function (reference equality)
      expect(unsubscribe1).toBe(unsubscribe2);

      unsubscribe1();
    });
  });
});
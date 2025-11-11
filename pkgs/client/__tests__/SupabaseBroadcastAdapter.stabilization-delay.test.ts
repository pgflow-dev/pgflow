import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseBroadcastAdapter } from '../src/lib/SupabaseBroadcastAdapter';
import {
  createMockClient,
} from './helpers/test-utils';
import { RUN_ID } from './fixtures';
import { mockChannelSubscription } from './mocks';

/**
 * Tests for configurable stabilization delay
 * Uses fake timers to verify the delay behavior without actual waiting
 */
describe('SupabaseBroadcastAdapter - Configurable Stabilization Delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Silence console logs/errors in tests
    vi.spyOn(console, 'error').mockImplementation(() => { /* intentionally empty */ });
    vi.spyOn(console, 'log').mockImplementation(() => { /* intentionally empty */ });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('should wait for custom delay before subscription completes', async () => {
    const customDelay = 500;
    const { client, mocks } = createMockClient();

    const adapter = new SupabaseBroadcastAdapter(client, {
      stabilizationDelayMs: customDelay
    });

    // Setup channel subscription that emits SUBSCRIBED immediately
    mockChannelSubscription(mocks);

    // Start subscription (returns promise)
    const subscribePromise = adapter.subscribeToRun(RUN_ID);

    // Track whether promise has resolved
    let isResolved = false;
    subscribePromise.then(() => { isResolved = true; });

    // Flush only microtasks (not timers) to process the SUBSCRIBED event
    await Promise.resolve();

    // At this point, SUBSCRIBED has been received but we should still be waiting
    // for the stabilization delay
    expect(isResolved).toBe(false);

    // Advance time by less than custom delay
    await vi.advanceTimersByTimeAsync(customDelay - 100);
    expect(isResolved).toBe(false); // Still waiting

    // Advance past the custom delay
    await vi.advanceTimersByTimeAsync(100);
    expect(isResolved).toBe(true); // Now it's ready!
  });

  test('should use default 300ms delay when not configured', async () => {
    const { client, mocks } = createMockClient();

    const adapter = new SupabaseBroadcastAdapter(client);

    mockChannelSubscription(mocks);

    const subscribePromise = adapter.subscribeToRun(RUN_ID);

    let isResolved = false;
    subscribePromise.then(() => { isResolved = true; });

    // Flush only microtasks
    await Promise.resolve();

    // Should NOT be ready before 300ms
    await vi.advanceTimersByTimeAsync(299);
    expect(isResolved).toBe(false);

    // Should be ready after 300ms
    await vi.advanceTimersByTimeAsync(1);
    expect(isResolved).toBe(true);
  });

  test('should be immediately ready when delay is 0', async () => {
    const { client, mocks } = createMockClient();

    const adapter = new SupabaseBroadcastAdapter(client, {
      stabilizationDelayMs: 0
    });

    mockChannelSubscription(mocks);

    const subscribePromise = adapter.subscribeToRun(RUN_ID);

    let isResolved = false;
    subscribePromise.then(() => { isResolved = true; });

    // Flush microtasks and timers
    await vi.runAllTimersAsync();

    // Should be ready immediately
    expect(isResolved).toBe(true);
  });

  test('should allow different delays for different adapter instances', async () => {
    const { client: client1, mocks: mocks1 } = createMockClient();
    const { client: client2, mocks: mocks2 } = createMockClient();

    const adapter1 = new SupabaseBroadcastAdapter(client1, {
      stabilizationDelayMs: 200
    });

    const adapter2 = new SupabaseBroadcastAdapter(client2, {
      stabilizationDelayMs: 400
    });

    mockChannelSubscription(mocks1);
    mockChannelSubscription(mocks2);

    const promise1 = adapter1.subscribeToRun('run-1');
    const promise2 = adapter2.subscribeToRun('run-2');

    let resolved1 = false;
    let resolved2 = false;
    promise1.then(() => { resolved1 = true; });
    promise2.then(() => { resolved2 = true; });

    // Flush microtasks only
    await Promise.resolve();

    // After 200ms, adapter1 should be ready but adapter2 should not
    await vi.advanceTimersByTimeAsync(200);
    expect(resolved1).toBe(true);
    expect(resolved2).toBe(false);

    // After 400ms total, both should be ready
    await vi.advanceTimersByTimeAsync(200);
    expect(resolved1).toBe(true);
    expect(resolved2).toBe(true);
  });
});

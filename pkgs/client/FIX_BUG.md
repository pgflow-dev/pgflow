# Duplicate Subscription Issue in PgflowClient

## Problem Description

The `PgflowClient.getRun()` method can create duplicate Supabase realtime channel subscriptions when called multiple times with the same `run_id`. Each call creates a new `FlowRun` instance that establishes its own subscription to the same channel topic.

## How to Reproduce

```typescript
const client = new PgflowClient(supabaseClient);

// First call - creates FlowRun instance A with subscription to "pgflow:run:123"
const run1 = await client.getRun("run-id-123");

// Second call - creates FlowRun instance B with ANOTHER subscription to "pgflow:run:123"
const run2 = await client.getRun("run-id-123");

// Now we have:
// - Two separate FlowRun instances (run1 !== run2)
// - Two separate channel subscriptions to the same topic
// - Both instances will receive duplicate events
```

## Consequences

1. **Duplicate Event Processing**: Both `FlowRun` instances receive and process the same broadcast events
2. **Memory Leaks**: Multiple active subscriptions that may not get cleaned up properly
3. **Network Overhead**: Unnecessary additional WebSocket connections and message processing
4. **State Conflicts**: Two instances maintaining separate state for the same logical run
5. **Resource Waste**: Increased memory usage and processing overhead

## Evidence in Current Code

Looking at the current implementation, `FlowRun` and `FlowStep` classes likely create their own channel subscriptions in their constructors or initialization methods. There's no apparent mechanism to:
- Cache `FlowRun` instances by `run_id`
- Share channel subscriptions between instances
- Prevent duplicate subscriptions

## Potential Solutions

### Option 1: Instance Caching (Recommended)

```typescript
class PgflowClient {
  private runCache = new Map<string, FlowRun>();

  async getRun(runId: string): Promise<FlowRun> {
    // Return cached instance if it exists
    if (this.runCache.has(runId)) {
      return this.runCache.get(runId)!;
    }

    // Create new instance and cache it
    const run = new FlowRun(/* ... */);
    this.runCache.set(runId, run);
    return run;
  }
}
```

### Option 2: Subscription Manager

```typescript
class ChannelManager {
  private subscriptions = new Map<string, { channel: RealtimeChannel, refCount: number }>();

  subscribe(topic: string, callback: Function) {
    if (this.subscriptions.has(topic)) {
      // Reuse existing subscription
      this.subscriptions.get(topic)!.refCount++;
    } else {
      // Create new subscription
      const channel = supabaseClient.channel(topic);
      this.subscriptions.set(topic, { channel, refCount: 1 });
    }
  }

  unsubscribe(topic: string) {
    const sub = this.subscriptions.get(topic);
    if (sub) {
      sub.refCount--;
      if (sub.refCount === 0) {
        sub.channel.unsubscribe();
        this.subscriptions.delete(topic);
      }
    }
  }
}
```

### Option 3: Reference Counting on FlowRun

```typescript
class FlowRun {
  private static instances = new Map<string, { instance: FlowRun, refCount: number }>();
  
  static async create(runId: string): Promise<FlowRun> {
    if (FlowRun.instances.has(runId)) {
      const entry = FlowRun.instances.get(runId)!;
      entry.refCount++;
      return entry.instance;
    }

    const instance = new FlowRun(runId);
    FlowRun.instances.set(runId, { instance, refCount: 1 });
    return instance;
  }

  dispose() {
    const entry = FlowRun.instances.get(this.runId);
    if (entry) {
      entry.refCount--;
      if (entry.refCount === 0) {
        // Clean up subscription and remove from cache
        this.channel.unsubscribe();
        FlowRun.instances.delete(this.runId);
      }
    }
  }
}
```

## Recommended Implementation

**Option 1 (Instance Caching)** is the simplest and most straightforward solution. It ensures:
- One `FlowRun` instance per `run_id`
- One channel subscription per run
- Consistent state across multiple `getRun()` calls
- Minimal code changes required

The cache should include:
- Automatic cleanup of completed/failed runs
- Memory management to prevent unbounded growth
- Proper disposal when the client is destroyed

## Testing Strategy

```typescript
// Test for duplicate subscription prevention
it('should return same FlowRun instance for same run_id', async () => {
  const run1 = await client.getRun('test-run-id');
  const run2 = await client.getRun('test-run-id');
  
  expect(run1).toBe(run2); // Same instance reference
});

// Test for subscription cleanup
it('should not create duplicate channel subscriptions', async () => {
  const channelSpy = vi.spyOn(supabaseClient, 'channel');
  
  await client.getRun('test-run-id');
  await client.getRun('test-run-id');
  
  // Should only call channel() once for the same run_id
  expect(channelSpy).toHaveBeenCalledTimes(1);
});
```
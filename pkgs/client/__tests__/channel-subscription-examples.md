# useChannelSubscription Helper Examples

## Basic Usage (Immediate Success)
```typescript
const { client, mocks } = mockSupabase();
useChannelSubscription(mocks); // Immediate success

const pgflowClient = new PgflowClient(client);
const run = await pgflowClient.getRun(RUN_ID); // ✅ Works immediately
```

## With Realistic Delay
```typescript
const { client, mocks } = mockSupabase();
useChannelSubscription(mocks, { delayMs: 200 }); // 200ms delay

const pgflowClient = new PgflowClient(client);
const run = await pgflowClient.getRun(RUN_ID); // ✅ Works after 200ms
```

## Simulating Subscription Failure
```typescript
const { client, mocks } = mockSupabase();
useChannelSubscription(mocks, { 
  shouldFail: true, 
  failureMessage: 'Connection timeout' 
});

const pgflowClient = new PgflowClient(client);
// This will trigger error handling in SupabaseBroadcastAdapter
```

## Testing Reconnection Scenarios
```typescript
// First subscription succeeds immediately
useChannelSubscription(mocks);
const adapter = new SupabaseBroadcastAdapter(client);
await adapter.subscribeToRun(RUN_ID); // ✅ Success

// Later, simulate connection failure for reconnection testing
const errorHandler = mocks.channel.systemHandlers.get('error');
errorHandler?.({ error: new Error('Connection lost') });
```

## Benefits of the Helper

### Before (Manual)
```typescript
// Repetitive and error-prone
mocks.channel.channel.subscribe = vi.fn().mockImplementation((callback) => {
  if (callback) callback('SUBSCRIBED');
  return mocks.channel.channel;
});
```

### After (Helper)
```typescript
// Clean and reusable
useChannelSubscription(mocks);
```

### Advanced Scenarios
```typescript
// Test different timing scenarios
useChannelSubscription(mocks, { delayMs: 50 });  // Fast connection
useChannelSubscription(mocks, { delayMs: 1000 }); // Slow connection
useChannelSubscription(mocks, { shouldFail: true }); // Connection failure
```
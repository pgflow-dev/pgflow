# pgflow Client Library Test Plan

## Executive Summary

This test plan addresses critical gaps in the pgflow client library test coverage, focusing on high-impact scenarios that will catch real production issues while maintaining MVP efficiency (80% value with 20% effort).

## Current Coverage Analysis

### Well-Tested Areas ✅
- Basic state transitions and status precedence
- Event emission and subscriptions  
- `waitForStatus` with timeout/abort
- Basic resource cleanup
- Happy path event routing

### Critical Gaps 🚨
- Concurrent operations and race conditions
- Network failures and reconnection logic
- Error recovery paths
- Step materialization edge cases
- Runtime type validation
- Integration-level testing

## Implementation Priorities (MVP-Focused)

### Phase 1: Critical Path (1-2 days)
These tests address issues users will definitely encounter in production.

#### 1. Reconnection Logic Tests
**File**: `__tests__/SupabaseBroadcastAdapter.test.ts` (enhance existing)
- Test reconnection after network drop
- Test state refresh fetching missed events during downtime
- Test exponential backoff behavior
- Test max reconnection attempts

#### 2. Concurrent Event Handling  
**File**: `__tests__/unit/concurrent-operations.test.ts` (new)
- Test out-of-order event arrival (completed before started)
- Test multiple clients observing same flow run
- Test rapid-fire events overwhelming the system
- Test concurrent `startFlow` calls with same flow

#### 3. Error Recovery Paths
**File**: `__tests__/PgflowClient.test.ts` (enhance existing)
- Test RPC failures during `startFlow`
- Test RPC failures during `getRun`
- Test malformed event payloads
- Test database query timeouts

### Phase 2: Robustness (1 day)
These tests ensure system reliability under edge cases.

#### 4. Type Guards Testing
**File**: `__tests__/unit/type-guards.test.ts` (new)
- Test all type guard functions with valid/invalid inputs
- Test handling of unexpected event shapes
- Test database type conversions
- Test null/undefined handling

#### 5. Step Materialization Edge Cases
**File**: `__tests__/FlowRun.test.ts` (enhance existing)
- Test step events arriving before `getRun` completes
- Test events for steps not in initial state
- Test memory management with 50+ steps
- Test step creation during disposal

#### 6. Integration Happy Path
**File**: `__tests__/integration/flow-lifecycle.test.ts` (new)
- Test complete flow execution: queued → started → completed
- Test flow with failures and retries
- Test flow with parallel steps
- Test subscription cleanup after completion

### Phase 3: Nice-to-Have (if time permits)
These can be deferred until scaling issues arise.

#### 7. Performance Testing
**File**: `__tests__/performance/load.test.ts` (new)
- Test with 100+ concurrent flows
- Test memory usage over time
- Test event processing throughput
- Test auto-disposal efficiency

#### 8. Advanced Error Scenarios
**File**: `__tests__/integration/error-scenarios.test.ts` (new)
- Test cascading failures
- Test partial state corruption
- Test Byzantine failures (conflicting events)

## Specific Test Scenarios

### Concurrent Operations Test Cases

```typescript
describe('Concurrent Operations', () => {
  it('handles out-of-order events correctly', async () => {
    // Emit completed event before started event
    // Verify state machine handles precedence correctly
  });

  it('handles multiple clients observing same run', async () => {
    // Create 3 clients all watching same run_id
    // Emit events and verify all clients update
  });

  it('handles rapid event bursts', async () => {
    // Emit 20 events within 10ms
    // Verify no events are dropped
  });
});
```

### Reconnection Test Cases

```typescript
describe('Reconnection Logic', () => {
  it('reconnects and fetches missed events', async () => {
    // Subscribe to run
    // Simulate disconnect
    // Emit events while disconnected
    // Simulate reconnect
    // Verify state is refreshed with missed events
  });

  it('implements exponential backoff', async () => {
    // Force multiple reconnection failures
    // Verify delays increase exponentially
  });
});
```

### Error Recovery Test Cases

```typescript
describe('Error Recovery', () => {
  it('handles RPC failures gracefully', async () => {
    // Mock RPC to fail with network error
    // Verify appropriate error is thrown
    // Verify no resources are leaked
  });

  it('handles malformed events', async () => {
    // Emit event missing required fields
    // Verify system doesn't crash
    // Verify error is logged
  });
});
```

## Test Implementation Guidelines

### Key Testing Patterns

1. **Event Sequence Testing**
   ```typescript
   const events = [started, completed, failed];
   emitEventsWithDelay(events, 10);
   await vi.runAllTimersAsync();
   ```

2. **Network Failure Simulation**
   ```typescript
   mockSupabase.rpc.mockRejectedValueOnce(new Error('Network error'));
   ```

3. **Concurrent Operations**
   ```typescript
   await Promise.all([
     client.startFlow('flow1'),
     client.startFlow('flow2'),
     client.getRun('existing-id')
   ]);
   ```

### Testing Best Practices

1. **Use fake timers for all async tests** - Ensures deterministic behavior
2. **Test both success and failure paths** - Don't just test happy paths
3. **Verify resource cleanup** - Check subscriptions are properly disposed
4. **Use fixtures for consistency** - Reuse test data across tests
5. **Keep tests focused** - One concept per test

## Success Metrics

- **Phase 1 Complete**: Can handle network issues and concurrent operations without data loss
- **Phase 2 Complete**: Robust against malformed data and edge cases
- **Overall Success**: 90%+ code coverage on critical paths with focus on real-world scenarios

## Timeline

- **Day 1**: Phase 1 implementation (reconnection, concurrency, errors)
- **Day 2**: Phase 2 implementation (type guards, edge cases, integration)
- **Day 3**: Review, refactor, and documentation (if needed)

This pragmatic approach ensures we catch the bugs that will actually affect users while avoiding over-engineering the test suite.
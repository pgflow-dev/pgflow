Here's an updated test coverage checklist with new recommended tests marked with ⭐:

# pgflow Test Coverage

## Core Flow Tests

- ✅ Run Flow, tracking completion of steps
- ✅ Run Flow errors for missing dependencies
- ❌ Run Flow with circular dependencies
- ❌ Run Flow with missing step handlers
- ❌ Run Flow pause/resume functionality
- ❌ Run Flow cancel functionality
- ⭐ Run Flow with conditional branches
- ⭐ Run Flow with dynamic step generation

## Step State Tests

- ✅ Step status transitions (pending -> completed/failed)
- ✅ Step dependency validation
- ✅ Step result storage

## Error Handling Tests

- ✅ Failed step retry behavior
- ✅ Maximum retries exceeded
- ✅ Invalid flow configuration
- ❌ Out of order execution attempts
- ❌ Race condition handling (performance/transactional tests)
- ⭐ Partial failure recovery
- ⭐ Error propagation across dependent steps

## Edge Cases

- ❌ Very large payloads
- ❌ Many concurrent flows
- ❌ Database deadlocks (need a way to increase possibility/simulate)

## Performance Tests

- ❌ Load testing maximum concurrent flow transactions (complete_step is most expensive)
- ❌ Database index optimization verification
- ❌ Memory usage under load
- ❌ Connection pool exhaustion
- ⭐ Step execution metrics collection
- ⭐ Flow completion time analysis

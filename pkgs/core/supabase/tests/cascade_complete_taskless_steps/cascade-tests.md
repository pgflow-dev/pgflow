# Test Plan: cascade_complete_taskless_steps Event Broadcasting

## Problem

The `cascade_complete_taskless_steps()` function completes steps silently without broadcasting `step:completed` events. This causes:
- Empty map steps to complete without client notification
- Cascaded step completions to be invisible to realtime clients
- Test failures in `@pkgs/client` for empty map step event handling

## Required Tests

All tests should verify that `step:completed` events are broadcast via `realtime.send()` for steps completed by cascade.

### 1. Empty Root Map Steps

**Scenario:** Flow with root map step receives empty array input

**Setup:**
```sql
-- Create flow with single root map step
SELECT pgflow.create_flow('empty_root_map');
SELECT pgflow.add_step('empty_root_map', 'process', deps := '{}', step_type := 'map');
```

**Test:**
```sql
-- Start flow with empty array
SELECT pgflow.start_flow('empty_root_map', '[]'::jsonb);

-- Verify step completed
SELECT status FROM pgflow.step_states
WHERE step_slug = 'process';
-- Expected: 'completed'

-- Verify step:completed event was broadcast
SELECT * FROM pgflow_realtime.messages
WHERE payload->>'event_type' = 'step:completed'
  AND payload->>'step_slug' = 'process';
-- Expected: 1 row with status='completed', output='[]'
```

**Current Status:** ❌ FAILING - Step completes but no event broadcast

---

### 2. Dependent Map with Empty Array Propagation

**Scenario:** Map step completes with 0 tasks, dependent map inherits empty array and cascades

**Setup:**
```sql
-- Create flow: root_map -> dependent_map
SELECT pgflow.create_flow('cascade_map_chain');
SELECT pgflow.add_step('cascade_map_chain', 'root_map', deps := '{}', step_type := 'map');
SELECT pgflow.add_step('cascade_map_chain', 'dependent_map', deps := '{"root_map"}', step_type := 'map');
```

**Test:**
```sql
-- Start flow with empty array
SELECT pgflow.start_flow('cascade_map_chain', '[]'::jsonb);

-- Verify both steps completed
SELECT step_slug, status, initial_tasks FROM pgflow.step_states
WHERE flow_slug = 'cascade_map_chain'
ORDER BY step_slug;
-- Expected:
--   root_map: completed, initial_tasks=0
--   dependent_map: completed, initial_tasks=0

-- Verify both step:completed events were broadcast
SELECT payload->>'step_slug' as step_slug, payload->>'status' as status
FROM pgflow_realtime.messages
WHERE payload->>'event_type' = 'step:completed'
ORDER BY payload->>'step_slug';
-- Expected: 2 rows, both with status='completed'
```

**Current Status:** ❌ FAILING - Both steps complete but no events broadcast

---

### 3. Single Step Cascade Chain

**Scenario:** Multiple single steps in a chain, each with 1 task

**Setup:**
```sql
-- Create flow: A -> B -> C (all single steps)
SELECT pgflow.create_flow('single_cascade');
SELECT pgflow.add_step('single_cascade', 'step_a');
SELECT pgflow.add_step('single_cascade', 'step_b', deps := '{"step_a"}');
SELECT pgflow.add_step('single_cascade', 'step_c', deps := '{"step_b"}');
```

**Test:**
```sql
-- Start flow
SELECT pgflow.start_flow('single_cascade', '{}'::jsonb);

-- Complete step_a task
-- This should trigger cascade for step_b and step_c
SELECT pgflow.complete_task(run_id, 'step_a', 0, '{"result": "a"}'::jsonb)
FROM pgflow.runs WHERE flow_slug = 'single_cascade';

-- Verify step_a broadcasts event (from complete_task, not cascade)
SELECT COUNT(*) FROM pgflow_realtime.messages
WHERE payload->>'step_slug' = 'step_a'
  AND payload->>'event_type' = 'step:completed';
-- Expected: 1

-- Complete step_b task
-- This should trigger cascade for step_c
SELECT pgflow.complete_task(run_id, 'step_b', 0, '{"result": "b"}'::jsonb)
FROM pgflow.runs WHERE flow_slug = 'single_cascade';

-- Complete step_c task
SELECT pgflow.complete_task(run_id, 'step_c', 0, '{"result": "c"}'::jsonb)
FROM pgflow.runs WHERE flow_slug = 'single_cascade';

-- Verify all three step:completed events were broadcast
SELECT payload->>'step_slug' as step_slug
FROM pgflow_realtime.messages
WHERE payload->>'event_type' = 'step:completed'
ORDER BY id;
-- Expected: step_a, step_b, step_c
```

**Note:** This test verifies normal task completion broadcasts work (baseline)

---

### 4. Mixed Chain with Cascade

**Scenario:** Single step -> empty map -> dependent empty map

**Setup:**
```sql
-- Create flow: producer -> map1 -> map2
SELECT pgflow.create_flow('mixed_cascade');
SELECT pgflow.add_step('mixed_cascade', 'producer');
SELECT pgflow.add_step('mixed_cascade', 'map1', deps := '{"producer"}', step_type := 'map');
SELECT pgflow.add_step('mixed_cascade', 'map2', deps := '{"map1"}', step_type := 'map');
```

**Test:**
```sql
-- Start flow
SELECT pgflow.start_flow('mixed_cascade', '{}'::jsonb);

-- Complete producer task with empty array output
SELECT pgflow.complete_task(run_id, 'producer', 0, '[]'::jsonb)
FROM pgflow.runs WHERE flow_slug = 'mixed_cascade';

-- Verify map1 and map2 cascade-completed
SELECT step_slug, status, initial_tasks FROM pgflow.step_states
WHERE flow_slug = 'mixed_cascade'
ORDER BY step_slug;
-- Expected:
--   producer: completed, initial_tasks=1
--   map1: completed, initial_tasks=0
--   map2: completed, initial_tasks=0

-- Verify all three step:completed events were broadcast
SELECT payload->>'step_slug' as step_slug, payload->>'output' as output
FROM pgflow_realtime.messages
WHERE payload->>'event_type' = 'step:completed'
ORDER BY id;
-- Expected:
--   producer: {"output": []}
--   map1: {"output": []}
--   map2: {"output": []}
```

**Current Status:** ❌ FAILING - map1 and map2 complete but no events broadcast

---

### 5. Multiple Iterations Cascade

**Scenario:** Deep chain requiring multiple cascade iterations

**Setup:**
```sql
-- Create flow: root_map -> m1 -> m2 -> m3 -> m4 (all maps)
SELECT pgflow.create_flow('deep_cascade');
SELECT pgflow.add_step('deep_cascade', 'root_map', deps := '{}', step_type := 'map');
SELECT pgflow.add_step('deep_cascade', 'm1', deps := '{"root_map"}', step_type := 'map');
SELECT pgflow.add_step('deep_cascade', 'm2', deps := '{"m1"}', step_type := 'map');
SELECT pgflow.add_step('deep_cascade', 'm3', deps := '{"m2"}', step_type := 'map');
SELECT pgflow.add_step('deep_cascade', 'm4', deps := '{"m3"}', step_type := 'map');
```

**Test:**
```sql
-- Start flow with empty array
SELECT pgflow.start_flow('deep_cascade', '[]'::jsonb);

-- Verify all steps completed
SELECT COUNT(*) FROM pgflow.step_states
WHERE flow_slug = 'deep_cascade' AND status = 'completed';
-- Expected: 5

-- Verify all step:completed events were broadcast (one per step)
SELECT COUNT(*) FROM pgflow_realtime.messages
WHERE payload->>'event_type' = 'step:completed'
  AND payload->>'flow_slug' = 'deep_cascade';
-- Expected: 5

-- Verify events broadcast in correct order
SELECT payload->>'step_slug' as step_slug
FROM pgflow_realtime.messages
WHERE payload->>'event_type' = 'step:completed'
ORDER BY id;
-- Expected: root_map, m1, m2, m3, m4
```

**Current Status:** ❌ FAILING - All steps complete but no events broadcast

---

### 6. Event Payload Verification

**Scenario:** Verify event payload contains all required fields

**Setup:**
```sql
SELECT pgflow.create_flow('payload_check');
SELECT pgflow.add_step('payload_check', 'empty_map', deps := '{}', step_type := 'map');
```

**Test:**
```sql
-- Start flow
SELECT pgflow.start_flow('payload_check', '[]'::jsonb);

-- Verify event payload structure
SELECT
  payload->>'event_type' as event_type,
  payload->>'run_id' IS NOT NULL as has_run_id,
  payload->>'step_slug' as step_slug,
  payload->>'status' as status,
  payload->>'started_at' IS NOT NULL as has_started_at,
  payload->>'completed_at' IS NOT NULL as has_completed_at,
  payload->>'output' as output
FROM pgflow_realtime.messages
WHERE payload->>'step_slug' = 'empty_map';
-- Expected:
--   event_type: 'step:completed'
--   has_run_id: true
--   step_slug: 'empty_map'
--   status: 'completed'
--   has_started_at: true
--   has_completed_at: true
--   output: '[]'
```

**Current Status:** ❌ FAILING - No event to verify

---

## Implementation Notes

1. **Realtime Message Capture:** Tests need to query the realtime messages table to verify broadcasts. The table name may vary based on schema setup.

2. **Event Ordering:** For cascade chains, events should be broadcast in topological order (iteration order).

3. **Output Aggregation:** For map steps, the `output` field should be an aggregated array of all task outputs (empty array for 0 tasks).

4. **Timing:** Events should be broadcast within the same transaction as the step completion to ensure consistency.

## Success Criteria

- ✅ All empty map steps broadcast `step:completed` events
- ✅ All cascade-completed steps broadcast events
- ✅ Event payloads contain correct data (status, timestamps, output)
- ✅ Events broadcast in correct order (topological)
- ✅ Client integration tests pass for empty map steps

## Related Files

- Implementation: `pkgs/core/schemas/0100_function_cascade_complete_taskless_steps.sql`
- Client tests: `pkgs/client/__tests__/integration/real-flow-execution.test.ts`
- Related issue: CTE optimization bug preventing `step:started` broadcasts

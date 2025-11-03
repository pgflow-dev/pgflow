---
name: pgtap-testing
description: Guide pgTAP test writing in pgflow. Use when user asks to create tests, write tests, add tests, create test files, fix tests, improve tests, add missing tests, create realtime tests, write database tests, test SQL functions, test broadcast events, test realtime events, add test coverage, create step tests, create run tests, test pgflow functions, or asks how to test database scenarios. Provides test patterns, helper functions, and realtime event testing examples. Use for any pgTAP test creation or modification.
---

# pgTAP Testing Guide

**CRITICAL**: Tests live in `pkgs/core/supabase/tests/`, helpers in `pkgs/core/supabase/seed.sql`

## Quick Reference

**Test Structure:**
```sql
begin;
select plan(N);                    -- Declare number of tests
select pgflow_tests.reset_db();    -- Clean state
-- ... setup and assertions ...
select finish();
rollback;
```

**Common Assertions:**
- `is(actual, expected, description)` - Equality check
- `results_eq(query1, query2, description)` - Compare query results
- `ok(boolean, description)` - Boolean check
- `throws_ok(query, description)` - Expect error

**Running Tests:**
```bash
# Single test
./scripts/run-test-with-colors pkgs/core/supabase/tests/path/to/test.sql

# All tests
pnpm nx test:pgtap core
```

## Test Structure

All pgTAP tests follow this pattern:

```sql
begin;                              -- Start transaction
select plan(N);                     -- Declare number of tests

-- Setup phase
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Test assertions
select is(
  (select count(*) from pgflow.runs),
  1::bigint,
  'Should create one run'
);

select finish();                    -- Complete tests
rollback;                          -- Roll back transaction
```

**Key points:**
- Transaction ensures isolation (BEGIN...ROLLBACK)
- `plan(N)` must match exact number of assertions
- `reset_db()` cleans state between test runs
- All changes are rolled back

## Common Patterns

### Testing Single Functions

Test a function's return value or side effects:

```sql
begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Execute function
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Test: Check created run
select results_eq(
  $$ SELECT flow_slug, status from pgflow.runs $$,
  $$ VALUES ('sequential', 'started') $$,
  'Run should be created with correct status'
);

select finish();
rollback;
```

### Testing Workflows (Setup → Execute → Assert)

Test complete workflows with multiple steps:

```sql
begin;
select plan(3);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start flow
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Poll and start task
select pgflow_tests.read_and_start('sequential');

-- Complete task
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '{"result": "done"}'::jsonb
);

-- Test: Task completed
select is(
  (select status from pgflow.step_tasks
   where step_slug = 'first' limit 1),
  'completed',
  'Task should be completed'
);

select finish();
rollback;
```

### Testing Error Conditions

Verify functions throw expected errors:

```sql
begin;
select plan(1);
select pgflow_tests.reset_db();

-- Test: Invalid flow slug
select throws_ok(
  $$ SELECT pgflow.start_flow('nonexistent', '{}') $$,
  'Flow not found: nonexistent'
);

select finish();
rollback;
```

### Testing Realtime Events

Verify realtime notifications are sent:

```sql
begin;
select plan(3);

-- CRITICAL: Create partition before testing realtime
select pgflow_tests.create_realtime_partition();

select pgflow_tests.reset_db();
select pgflow.create_flow('sequential');
select pgflow.add_step('sequential', 'first');

-- Capture run_id in temporary table
with flow as (
  select * from pgflow.start_flow('sequential', '{}')
)
select run_id into temporary run_ids from flow;

-- Test: Event was sent
select is(
  pgflow_tests.count_realtime_events(
    'run:started',
    (select run_id from run_ids)
  ),
  1::int,
  'Should send run:started event'
);

-- Test: Event payload is correct
select is(
  (select payload->>'status'
   from pgflow_tests.get_realtime_message(
     'run:started',
     (select run_id from run_ids)
   )),
  'started',
  'Event should have correct status'
);

-- Cleanup
drop table if exists run_ids;

select finish();
rollback;
```

## Common Assertions

**Equality checks:**
```sql
select is(actual, expected, 'description');
```

**Query result comparison:**
```sql
select results_eq(
  $$ SELECT col1, col2 FROM table1 $$,
  $$ VALUES ('val1', 'val2') $$,
  'description'
);
```

**Boolean checks:**
```sql
select ok(boolean_expression, 'description');
```

**Error handling:**
```sql
select throws_ok($$ SELECT function_call() $$, 'error message');
select lives_ok($$ SELECT function_call() $$, 'should not error');
```

**Pattern matching:**
```sql
select alike(actual, 'pattern%', 'description');
```

## Helper Functions

pgflow provides test helpers in `pgflow_tests` schema. See [helpers.md](helpers.md) for complete reference.

**Most commonly used:**
- `reset_db()` - Clean all pgflow data and queues
- `setup_flow(slug)` - Create predefined test flow
- `read_and_start(flow_slug)` - Poll and start tasks
- `poll_and_complete(flow_slug)` - Poll and complete task
- `poll_and_fail(flow_slug)` - Poll and fail task
- `create_realtime_partition()` - Required for realtime tests
- `count_realtime_events(type, run_id)` - Count events sent
- `get_realtime_message(type, run_id)` - Get full event message

## Test Organization

**Directory structure:**
```
pkgs/core/supabase/tests/
├── start_flow/          # Tests for starting flows
├── complete_task/       # Tests for task completion
├── fail_task/           # Tests for task failures
├── realtime/            # Tests for realtime events
└── [feature]/           # Group related tests by feature
```

**Naming convention:**
- Test files: `descriptive_name.test.sql`
- One test file per specific behavior
- Group related tests in directories

## Running Tests

**Single test:**
```bash
./scripts/run-test-with-colors pkgs/core/supabase/tests/start_flow/creates_run.test.sql
```

**All tests:**
```bash
pnpm nx test:pgtap core
```

**Watch mode:**
```bash
pnpm nx test:pgtap:watch core
```

## Example Test Files

See existing tests for patterns:
- `tests/start_flow/creates_run.test.sql` - Basic workflow
- `tests/complete_task/completes_task_and_updates_dependents.test.sql` - Complex workflow
- `tests/realtime/start_flow_events.test.sql` - Realtime testing
- `tests/type_violations/*.test.sql` - Error testing

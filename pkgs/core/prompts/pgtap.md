# PGTap Testing Guidelines

## Overview

This document outlines a set of rules, best practices, ideas, and guidelines for writing pgTap tests for the project.

## File Organization

- Store test files under the `supabase/tests/` directory.
- Use descriptive file names with the `.test.sql` suffix.
- Organize tests in subfolders, by functionality (e.g., `start_flow`, `create_flow`, `add_step`, `start_tasks`, `complete_task`, etc).

## Transactional Test Structure

Wrap each test in a transaction to ensure isolation:

```sql
begin;
select plan(2);
-- Test queries here
select finish();
rollback;
```

## Setup and Teardown

Reset and prepare the database context at the start of each test:

```sql
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');
```

Terminate tests with:

```sql
select finish();
rollback;
```

## Declaring the Test Plan

Declare the number of tests using the `plan()` function:

```sql
select plan(2);
```

## Using pgTap Assertions

Use the following assertion functions to verify expected outcomes:

- `is(actual, expected, message)`
- `results_eq(actual, expected, message)`
- `set_eq(actual_query, expected_array, message)`
- `throws_ok(query, expected_error_message, message)`
- `ok(boolean_expression, message)`

### Example: Validating Run Creation

```sql
select pgflow.start_flow('sequential', '"hello"'::jsonb);

select results_eq(
  $$ SELECT flow_slug, status, input FROM pgflow.runs $$,
  $$ VALUES ('sequential', 'started', '"hello"'::jsonb) $$,
  'Run should be created with appropriate status and input'
);

select is(
  (select remaining_steps::int from pgflow.runs limit 1),
  3::int,
  'remaining_steps should be equal to number of steps'
);
```

### Example: Testing Error Handling

```sql
select throws_ok(
  $$ SELECT pgflow.create_flow('invalid-flow') $$,
  'new row for relation "flows" violates check constraint "flows_flow_slug_check"',
  'Should detect and prevent invalid flow slug'
);
```

## Idempotence and Duplicate Prevention

Run operations multiple times to ensure idempotency and that no duplicates are created:

```sql
select pgflow.create_flow('test_flow');
select pgflow.create_flow('test_flow');

select results_eq(
  $$ SELECT flow_slug FROM pgflow.flows $$,
  array['test_flow']::text [],
  'No duplicate flow should be created'
);
```

## Testing Dependencies and Flow Isolation

Ensure that steps and dependencies remain isolated within a flow:

```sql
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first_step');

select pgflow.create_flow('another_flow');
select pgflow.add_step('another_flow', 'first_step');
select pgflow.add_step('another_flow', 'another_step', array['first_step']);

select set_eq(
  $$
      SELECT flow_slug, step_slug
      FROM pgflow.steps WHERE flow_slug = 'another_flow'
  $$,
  $$ VALUES
       ('another_flow', 'another_step'),
       ('another_flow', 'first_step')
  $$,
  'Steps in second flow should be isolated from first flow'
);
```

## Testing Two-Phase Task Polling

Test the two-phase polling approach with read_with_poll and start_tasks:

```sql
-- Test phase 1: reading messages
select is(
  (select count(*)::integer from pgflow.read_with_poll(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 1,
    max_poll_seconds => 1
  )),
  1::integer,
  'First read_with_poll should get the available message'
);

-- Test phase 2: starting tasks
select is(
  (select count(*)::integer from pgflow.start_tasks(
    flow_slug => 'sequential'::text,
    msg_ids => array[1],
    worker_id => '550e8400-e29b-41d4-a716-446655440000'::uuid
  )),
  1::integer,
  'start_tasks should return one task for valid message'
);

-- Test visibility timeout
select is(
  (select count(*)::integer from pgflow.read_with_poll(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 1,
    max_poll_seconds => 1
  )),
  0::integer,
  'Concurrent read_with_poll should not get the same message (due to visibility timeout)'
);
```

## Completing Tasks and Flow Progression

Ensure that task completions update state and trigger dependents:

```sql
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '{"result": "first completed"}'::jsonb
);

select results_eq(
  $$ SELECT status, output FROM pgflow.step_tasks
     WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
       AND step_slug = 'first' $$,
  $$ VALUES ('completed', '{"result": "first completed"}'::jsonb) $$,
  'Task should be marked as completed with correct output'
);
```

## Archiving Processed Messages

Verify that messages are archived after task completion:

```sql
select is(
  (select message ->> 'step_slug' from pgmq.q_sequential limit 1),
  'first',
  'First message should be in the queue'
);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '"first was successful"'::jsonb
);

select is(
  (select count(*)::INT from pgmq.q_sequential where message ->> 'step_slug' = 'first'),
  0::INT,
  'There should be no messages in the queue'
);

select is(
  (select count(*)::INT from pgmq.a_sequential where message ->> 'step_slug' = 'first' limit 1),
  1::INT,
  'The message should be archived'
);
```

## Validating Input with Custom Validators

Use custom functions to check input formats:

```sql
select ok(
  pgflow.is_valid_slug('valid_slug'),
  'is_valid_slug returns true for string with underscore'
);
```

## Conclusion

Adhere to the following best practices when writing pgTap tests:

- Keep tests self-contained with proper setup and teardown.
- Use transactions to isolate tests.
- Declare a clear test plan using `plan()`.
- Write focused tests with descriptive messages.
- Ensure idempotence by re-running operations.
- Validate both positive outcomes and error cases.

Following these guidelines will help maintain consistency, reliability, and clarity in your pgTap tests.

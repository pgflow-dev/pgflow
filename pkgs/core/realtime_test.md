# Comprehensive Test Plan for Realtime Notifications in pgflow

## Overview

This document outlines a testing strategy for the realtime notification functionality recently added to pgflow. Now that we have a reliable way to set up the database environment correctly with `pgflow_tests.create_realtime_partition()`, we need a comprehensive test suite to verify that realtime notifications are properly sent at the right times during workflow execution.

## Important: Realtime Partition Creation

The `realtime.send()` function will silently fail if the appropriate date partition for the `realtime.messages` table doesn't exist. This is by design - in production, a "Janitor" process would create these partitions, but in tests, we need to handle this manually.

Before executing any test involving realtime notifications, you **must** create the necessary partition using:

```sql
-- Create partition for the current date
SELECT pgflow_tests.create_realtime_partition();

-- Or for a specific date
SELECT pgflow_tests.create_realtime_partition('2025-05-09'::date);
```

This function:
- Creates a partition named `messages_YYYY_MM_DD` for the specified date
- Returns `true` if it created a new partition or `false` if the partition already existed
- Is idempotent - safe to call multiple times
- Ensures that subsequent `realtime.send()` calls will work correctly

Without this step, your tests may appear to pass, but no realtime messages will actually be stored in the database.

## Functions That Send Realtime Notifications

From examining the migration file `20250509092537_pgflow_add_realtime.sql`, the following functions send realtime notifications:

1. `pgflow.start_flow` - Sends 'run:started' event
2. `pgflow.complete_task` - Sends 'step:completed' event
3. `pgflow.fail_task` - Sends 'step:failed' and 'run:failed' events
4. `pgflow.maybe_complete_run` - Sends 'run:completed' event
5. `pgflow.start_ready_steps` - Sends 'step:started' event

## Testing Approach

For each function, we'll create a test that:

1. Sets up the realtime partition for today's date
2. Executes the function in a way that should trigger one or more realtime notifications
3. Verifies that the expected notifications were created in the `realtime.messages` table
4. Verifies the content of those notifications (event types, payload structure)

We'll use the existing pgTAP assertions framework and pgflow_tests helper functions.

## Test Plan Details

### 1. Test: `start_flow` Realtime Notifications

Create a test file: `supabase/tests/realtime/start_flow_events.test.sql`

**Purpose**: Verify that `pgflow.start_flow` sends the 'run:started' event.

**Steps**:
1. Create the realtime partition for today's date
2. Reset the database
3. Create a test flow (e.g., 'sequential')
4. Start the flow using `pgflow.start_flow`
5. Check that a 'run:started' event is sent to realtime.messages
6. Verify that the event payload contains the correct run_id, flow_slug, status, etc.

**Assertions**:
- Count of 'run:started' events should be 1
- The event should have the correct structure and data

### 2. Test: `complete_task` Realtime Notifications

Create a test file: `supabase/tests/realtime/complete_task_events.test.sql`

**Purpose**: Verify that `pgflow.complete_task` sends the 'step:completed' event.

**Steps**:
1. Create the realtime partition for today's date
2. Reset the database
3. Set up a test flow using `pgflow_tests.setup_flow('sequential')`
4. Start the flow
5. Complete a task using `pgflow.complete_task`
6. Check that a 'step:completed' event is sent to realtime.messages
7. Verify that the event payload contains the correct run_id, step_slug, status, etc.

**Assertions**:
- Count of 'step:completed' events should be 1
- The event should have the correct structure and data

### 3. Test: `fail_task` Realtime Notifications

Create a test file: `supabase/tests/realtime/fail_task_events.test.sql`

**Purpose**: Verify that `pgflow.fail_task` sends 'step:failed' and, when appropriate, 'run:failed' events.

**Steps**:
1. Create the realtime partition for today's date
2. Reset the database
3. Set up a test flow 
4. Start the flow
5. Execute `pgflow.fail_task` with no retries available (set max_attempts to 1)
6. Check that 'step:failed' event is sent to realtime.messages
7. Check that 'run:failed' event is sent to realtime.messages (if the run should fail)
8. Verify that the event payloads contain the correct information

**Assertions**:
- Count of 'step:failed' events should be 1
- Count of 'run:failed' events should be 1 (if the run fails)
- The events should have the correct structure and data

### 4. Test: `maybe_complete_run` Realtime Notifications

Create a test file: `supabase/tests/realtime/maybe_complete_run_events.test.sql`

**Purpose**: Verify that `pgflow.maybe_complete_run` sends the 'run:completed' event when a run is completed.

**Steps**:
1. Create the realtime partition for today's date
2. Reset the database
3. Set up a test flow with a single step
4. Start the flow
5. Complete the step task
6. Check that a 'run:completed' event is sent to realtime.messages
7. Verify that the event payload contains the correct run_id, flow_slug, status, etc.

**Assertions**:
- Count of 'run:completed' events should be 1
- The event should have the correct structure and data

### 5. Test: `start_ready_steps` Realtime Notifications

Create a test file: `supabase/tests/realtime/start_ready_steps_events.test.sql`

**Purpose**: Verify that `pgflow.start_ready_steps` sends 'step:started' events.

**Steps**:
1. Create the realtime partition for today's date
2. Reset the database
3. Set up a test flow with dependent steps (e.g., 'sequential')
4. Start the flow
5. Complete a step that has dependents
6. Verify that 'step:started' events are sent for the newly ready steps
7. Check the event payload for correct run_id, step_slug, status, etc.

**Assertions**:
- Count of 'step:started' events matches the number of steps started
- The events have the correct structure and data

### 6. Combined Flow Test

Create a test file: `supabase/tests/realtime/full_flow_events.test.sql`

**Purpose**: Test a complete flow execution and verify all expected realtime events are sent.

**Steps**:
1. Create the realtime partition for today's date
2. Reset the database
3. Set up a test flow with multiple steps (e.g., 'two_roots_left_right')
4. Start the flow
5. Complete all steps in sequence
6. Verify that all expected realtime events are sent:
   - 'run:started' (1)
   - 'step:started' for each step (based on flow topology)
   - 'step:completed' for each completed step
   - 'run:completed' (1)

**Assertions**:
- Count of each event type matches expectations
- Events are sent in the correct order
- All events have the correct structure and data

## Helper Functions for Event Verification

To facilitate testing and make assertions more readable, I've added two helper functions to `supabase/seed.sql`:

### 1. `pgflow_tests.find_realtime_event(event_type, run_id, step_slug)`

This function retrieves the payload of a realtime event matching the given criteria:

```sql
-- Find a specific event and return its full payload
SELECT pgflow_tests.find_realtime_event('run:started', v_run_id) as event_payload;

-- Find a step-specific event by providing the step_slug
SELECT pgflow_tests.find_realtime_event('step:completed', v_run_id, 'first') as event_payload;
```

### 2. `pgflow_tests.count_realtime_events(event_type, run_id, step_slug)`

This function counts the number of realtime events matching the given criteria:

```sql
-- Count all run:started events for a specific run
SELECT pgflow_tests.count_realtime_events('run:started', v_run_id);

-- Count step:completed events for a specific step
SELECT pgflow_tests.count_realtime_events('step:completed', v_run_id, 'first');
```

## Using the Helper Functions in Tests

Here's how to use these helper functions with pgTAP assertions:

### Message Count Verification

```sql
-- Verify exact count of specific event type
SELECT is(
  pgflow_tests.count_realtime_events('run:started', v_run_id),
  1,
  'Should send exactly one run:started event'
);
```

### Message Content Verification

```sql
-- Store the event payload in a variable for multiple assertions
DO $$
DECLARE
  run_started_payload jsonb;
BEGIN
  SELECT pgflow_tests.find_realtime_event('run:started', v_run_id) INTO run_started_payload;

  -- Test multiple aspects of the payload
  PERFORM is(
    run_started_payload->>'flow_slug',
    'sequential',
    'The run:started event should contain the correct flow_slug'
  );

  PERFORM is(
    run_started_payload->>'status',
    'started',
    'The run:started event should have status "started"'
  );

  PERFORM ok(
    (run_started_payload->>'started_at')::timestamptz IS NOT NULL,
    'The run:started event should include a started_at timestamp'
  );

  -- For nullable fields, check if they exist
  PERFORM ok(
    run_started_payload ? 'input',
    'The run:started event should include the input field'
  );

  -- For numeric fields, ensure they are numbers
  PERFORM ok(
    (run_started_payload->>'remaining_steps')::int > 0,
    'The run:started event should include the remaining_steps count'
  );
END; $$;
```

### Event Channel Verification

```sql
-- Get the full message record to check event & topic
SELECT is(
  (SELECT event FROM realtime.messages
   WHERE payload->>'event_type' = 'step:completed'
   AND payload->>'run_id' = v_run_id::text
   AND payload->>'step_slug' = 'first'),
  'step:first:completed',
  'The step:completed event should have the correct event name'
);

SELECT is(
  (SELECT topic FROM realtime.messages
   WHERE payload->>'event_type' = 'step:completed'
   AND payload->>'run_id' = v_run_id::text
   AND payload->>'step_slug' = 'first'),
  concat('pgflow:run:', v_run_id),
  'The step:completed event should have the correct topic'
);
```

### Checking for Missing Events

```sql
-- Verify that an event doesn't exist
SELECT is(
  pgflow_tests.count_realtime_events('run:failed', v_run_id),
  0,
  'Should NOT send a run:failed event for successful flows'
);

-- Verify that an event exists
SELECT ok(
  pgflow_tests.find_realtime_event('step:completed', v_run_id, 'first') IS NOT NULL,
  'Should send a step:completed event for the first step'
);
```

## Implementation Strategy

1. Implement tests in order of execution flow: start_flow → start_ready_steps → complete_task/fail_task → maybe_complete_run
2. For each test, include detailed assertions that verify:
   - Exact count of events
   - All required payload fields with correct values
   - Proper event and topic formatting
   - Timestamps are present and in the expected order
3. End with the combined flow test that verifies all events together in a complete workflow execution

## Not In Scope

1. Testing notification delivery to clients
2. Testing the client-side event handling
3. Performance testing of the realtime notification system

This test plan focuses solely on verifying that the appropriate realtime notifications are generated and stored in the `realtime.messages` table during normal workflow execution.
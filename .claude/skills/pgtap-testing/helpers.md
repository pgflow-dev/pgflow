# pgTAP Test Helpers Reference

All helpers are in the `pgflow_tests` schema. Source: `pkgs/core/supabase/seed.sql`

## Database Management

### reset_db()

Cleans all pgflow data and drops all pgmq queues. Use at the start of every test.

```sql
select pgflow_tests.reset_db();
```

Deletes from:
- `pgflow.step_tasks`
- `pgflow.step_states`
- `pgflow.runs`
- `pgflow.deps`
- `pgflow.steps`
- `pgflow.flows`
- `realtime.messages`
- Drops all pgmq queues

### create_realtime_partition()

Creates partition for `realtime.messages` table. **Required before testing realtime events.**

```sql
select pgflow_tests.create_realtime_partition();
```

**Why needed:** `realtime.send()` silently fails without proper partition. Always call this before realtime tests.

## Flow Setup

### setup_flow(flow_slug)

Creates predefined test flows with common patterns.

```sql
select pgflow_tests.setup_flow('sequential');
```

**Available flows:**
- `'sequential'` - Three steps: first → second → last
- `'two_roots'` - Two root steps merging into one: root_a, root_b → last
- `'two_roots_left_right'` - Root with diverging paths
- `'sequential_other'` - Same as sequential but named 'other'

### ensure_worker(queue_name, worker_uuid, function_name)

Creates or updates a test worker. Usually called internally by `read_and_start()`.

```sql
select pgflow_tests.ensure_worker(
  queue_name => 'my_flow',
  worker_uuid => '11111111-1111-1111-1111-111111111111'::uuid,
  function_name => 'test_worker'
);
```

**Default values:**
- `worker_uuid`: `'11111111-1111-1111-1111-111111111111'::uuid`
- `function_name`: `'test_worker'`

## Task Operations

### read_and_start(flow_slug, vt, qty, worker_uuid, function_name)

Polls messages from queue and starts tasks in one operation.

```sql
-- Start one task with default settings
select pgflow_tests.read_and_start('sequential');

-- Start multiple tasks
select pgflow_tests.read_and_start('sequential', vt => 1, qty => 3);
```

**Parameters:**
- `flow_slug` - Queue name (required)
- `vt` - Visibility timeout in seconds (default: 1)
- `qty` - Number of tasks to start (default: 1)
- `worker_uuid` - Worker ID (default: test UUID)
- `function_name` - Worker function name (default: 'test_worker')

**Returns:** `setof pgflow.step_task_record`

### poll_and_complete(flow_slug, vt, qty)

Polls for a task and immediately completes it. Useful for testing downstream effects.

```sql
select pgflow_tests.poll_and_complete('sequential');
```

**Returns:** `setof pgflow.step_tasks`

### poll_and_fail(flow_slug, vt, qty)

Polls for a task and immediately fails it. Useful for testing error handling.

```sql
select pgflow_tests.poll_and_fail('sequential');
```

**Returns:** `setof pgflow.step_tasks`

## Realtime Testing

### count_realtime_events(event_type, run_id, step_slug)

Counts realtime events matching criteria.

```sql
-- Count run-level events
select pgflow_tests.count_realtime_events(
  'run:started',
  run_id
);

-- Count step-level events
select pgflow_tests.count_realtime_events(
  'step:completed',
  run_id,
  'first'
);
```

**Returns:** `integer`

### get_realtime_message(event_type, run_id, step_slug)

Returns full realtime message record including topic and event fields.

```sql
-- Get run event message
select pgflow_tests.get_realtime_message(
  'run:started',
  run_id
);

-- Get step event message
select pgflow_tests.get_realtime_message(
  'step:completed',
  run_id,
  'first'
);
```

**Returns:** `realtime.messages` (includes id, inserted_at, event, topic, payload)

**Common usage:**
```sql
-- Extract payload field
select payload->>'status'
from pgflow_tests.get_realtime_message('run:started', run_id);

-- Check topic
select topic
from pgflow_tests.get_realtime_message('run:started', run_id);
```

### find_realtime_event(event_type, run_id, step_slug)

Returns just the JSONB payload of a matching event.

```sql
-- Find run event payload
select pgflow_tests.find_realtime_event(
  'run:started',
  run_id
);
```

**Returns:** `jsonb` (payload only)

## Timing Helpers

### message_timing(step_slug, queue_name)

Returns message timing information including visibility timeout in seconds.

```sql
select * from pgflow_tests.message_timing('first', 'sequential');
```

**Returns:** Table with columns:
- `msg_id` - Message ID
- `read_ct` - Read count
- `enqueued_at` - When message was queued
- `vt` - Visibility timeout timestamp
- `message` - Message JSONB
- `vt_seconds` - Delay in seconds (calculated)

### reset_message_visibility(queue_name)

Makes all hidden messages immediately visible for testing retry logic without waiting.

```sql
select pgflow_tests.reset_message_visibility('sequential');
```

**Returns:** `integer` (number of messages made visible)

### assert_retry_delay(queue_name, step_slug, expected_delay, description)

Asserts that retry delay matches expected value.

```sql
select pgflow_tests.assert_retry_delay(
  'sequential',
  'first',
  5,
  'First retry should have 5 second delay'
);
```

**Returns:** `text` (pgTAP assertion result)

## Timestamp Manipulation

These helpers set timestamps for completed/failed/running flows to simulate age.

### set_completed_flow_timestamps(flow_slug, days_old)

Sets timestamps to make completed run appear N days old.

```sql
select pgflow_tests.set_completed_flow_timestamps('sequential', 30);
```

### set_failed_flow_timestamps(flow_slug, days_old)

Sets timestamps to make failed run appear N days old.

```sql
select pgflow_tests.set_failed_flow_timestamps('sequential', 30);
```

### set_running_flow_timestamps(flow_slug, days_old)

Sets timestamps to make running flow appear N days old.

```sql
select pgflow_tests.set_running_flow_timestamps('sequential', 30);
```

**Use case:** Testing pruning/cleanup logic that operates on old data.

## Realtime Assertion Helpers

### assert_realtime_event_sent(event_type, description)

Asserts at least one event of given type was sent.

```sql
select pgflow_tests.assert_realtime_event_sent(
  'run:started',
  'Should send run:started event'
);
```

### assert_step_event_sent(event_type, step_slug, description)

Asserts event was sent for specific step.

```sql
select pgflow_tests.assert_step_event_sent(
  'step:completed',
  'first',
  'Should send step:completed for first step'
);
```

### assert_run_event_sent(event_type, flow_slug, description)

Asserts event was sent for specific flow.

```sql
select pgflow_tests.assert_run_event_sent(
  'run:started',
  'sequential',
  'Should send run:started for sequential flow'
);
```

**Note:** These helpers query `pgflow_tests.realtime_calls` table (mock mode). For testing actual realtime.messages, use `count_realtime_events()` and `get_realtime_message()` instead.

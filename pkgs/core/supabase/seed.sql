create schema if not exists pgflow_tests;

--------------------------------------------------------------------------------
--------- reset_db - clears all tables and drops all queues --------------------
--------------------------------------------------------------------------------
create or replace function pgflow_tests.reset_db() returns void as $$
BEGIN
  -- Delete pgflow data
  DELETE FROM pgflow.step_tasks;
  DELETE FROM pgflow.step_states;
  DELETE FROM pgflow.runs;
  DELETE FROM pgflow.deps;
  DELETE FROM pgflow.steps;
  DELETE FROM pgflow.flows;

  -- Also clear the realtime.messages table if it exists
  BEGIN
    DELETE FROM realtime.messages;
  EXCEPTION WHEN undefined_table THEN
    -- Ignore if table doesn't exist (useful in tests that run before migrations)
    NULL;
  END;

  -- Drop pgmq queues
  PERFORM pgmq.drop_queue(queue_name) FROM pgmq.list_queues();
END;
$$ language plpgsql;

--------------------------------------------------------------------------------
--------- setup_flow - creates a predefined flow and adds steps to it ----------
--------------------------------------------------------------------------------
create or replace function pgflow_tests.setup_flow(
  flow_slug text
) returns void as $$
begin

if flow_slug = 'sequential' then
  PERFORM pgflow.create_flow('sequential', timeout => 1);
  PERFORM pgflow.add_step('sequential', 'first');
  PERFORM pgflow.add_step('sequential', 'second', ARRAY['first']);
  PERFORM pgflow.add_step('sequential', 'last', ARRAY['second']);
elsif flow_slug = 'sequential_other' then
  PERFORM pgflow.create_flow('other', timeout => 1);
  PERFORM pgflow.add_step('other', 'first');
  PERFORM pgflow.add_step('other', 'second', ARRAY['first']);
  PERFORM pgflow.add_step('other', 'last', ARRAY['second']);
elsif flow_slug = 'two_roots' then
  PERFORM pgflow.create_flow('two_roots', timeout => 1);
  PERFORM pgflow.add_step('two_roots', 'root_a');
  PERFORM pgflow.add_step('two_roots', 'root_b');
  PERFORM pgflow.add_step('two_roots', 'last', ARRAY['root_a', 'root_b']);
elsif flow_slug = 'two_roots_left_right' then
  PERFORM pgflow.create_flow('two_roots_left_right', timeout => 1);
  PERFORM pgflow.add_step('two_roots_left_right', 'connected_root');
  PERFORM pgflow.add_step('two_roots_left_right', 'disconnected_root');
  PERFORM pgflow.add_step('two_roots_left_right', 'left', ARRAY['connected_root']);
  PERFORM pgflow.add_step('two_roots_left_right', 'right', ARRAY['connected_root']);
else
  RAISE EXCEPTION 'Unknown test flow: %', flow_slug;
end if;

end;
$$ language plpgsql;

--------------------------------------------------------------------------------
------- poll_and_fail - polls for a task and fails it immediately --------------
--------------------------------------------------------------------------------
create or replace function pgflow_tests.poll_and_fail(
  flow_slug text,
  vt integer default 1,
  qty integer default 1
) returns setof pgflow.step_tasks as $$
  -- Poll for a task and fail it in one step
  WITH task AS (
    SELECT * FROM pgflow.poll_for_tasks(flow_slug, vt, qty) LIMIT 1
  )
  SELECT pgflow.fail_task(
    (SELECT run_id FROM task),
    (SELECT step_slug FROM task),
    0,
    concat(task.step_slug, ' FAILED')
  )
  FROM task;
$$ language sql;

--------------------------------------------------------------------------------
------- poll_and_complete - polls for a task and completes it immediately ------
--------------------------------------------------------------------------------
create or replace function pgflow_tests.poll_and_complete(
  flow_slug text,
  vt integer default 1,
  qty integer default 1
) returns setof pgflow.step_tasks as $$
  -- Poll for a task and complete it in one step
  WITH task AS (
    SELECT * FROM pgflow.poll_for_tasks(flow_slug, vt, qty) LIMIT 1
  )
  SELECT pgflow.complete_task(
    (SELECT run_id FROM task),
    (SELECT step_slug FROM task),
    0,
    jsonb_build_object('input', task.input)
  )
  FROM task;
$$ language sql;

--------------------------------------------------------------------------------
------- message_timing - returns messages with added vt_seconds int ------------
--------------------------------------------------------------------------------
create or replace function pgflow_tests.message_timing(step_slug text, queue_name text)
returns table (
  msg_id bigint,
  read_ct int,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb,
  vt_seconds int
)
language plpgsql
as $$
DECLARE
  qtable TEXT;
  query TEXT;
BEGIN
  qtable := pgmq.format_table_name(queue_name, 'q');

  query := format('
    SELECT
      q.msg_id,
      q.read_ct,
      q.enqueued_at,
      q.vt,
      q.message,
      extract(epoch from (q.vt - q.enqueued_at))::int as vt_seconds
    FROM pgmq.%s q
    JOIN pgflow.step_tasks st ON st.message_id = q.msg_id
    WHERE st.step_slug = $1', qtable);

  RETURN QUERY EXECUTE query USING step_slug;
END;
$$;

--------------------------------------------------------------------------------
------- reset_message_visibility -----------------------------------------------
--------------------------------------------------------------------------------
--
-- Makes all hidden messages in a queue immediately visible by setting their
-- visibility time (vt) to the current timestamp.
--
-- This is a test utility that allows testing retry logic without waiting for
-- actual delays to expire. It directly modifies the pgmq queue table.
--
-- @param queue_name The name of the queue to modify
-- @return The number of messages that were made visible
--
create or replace function pgflow_tests.reset_message_visibility(
  queue_name text
) returns integer as $$
DECLARE
  qtable TEXT;
  query TEXT;
  updated_count INTEGER;
BEGIN
  -- Get the formatted table name for the queue
  qtable := pgmq.format_table_name(queue_name, 'q');

  -- Construct and execute the query to update all messages' visibility time
  query := format('
    UPDATE pgmq.%s
    SET vt = clock_timestamp()
    WHERE vt > clock_timestamp()
    RETURNING 1', qtable);

  -- Execute the query and count the number of updated rows
  EXECUTE query INTO updated_count;

  -- Return the number of messages that were made visible
  RETURN COALESCE(updated_count, 0);
END;
$$ language plpgsql;


--------------------------------------------------------------------------------
------- assert_retry_delay -----------------------------------------------------
--------------------------------------------------------------------------------
--
-- Asserts that the calculated retry delay matches the expected value.
--
-- @param step_slug The slug of the step to check
-- @param queue_name The name of the queue to check
-- @param expected_delay The expected delay value
-- @param description A description of the test case
-- @return TEXT result from the is() function
--
create or replace function pgflow_tests.assert_retry_delay(
  queue_name text,
  step_slug text,
  expected_delay integer,
  description text
) returns text as $$
DECLARE
  actual_delay INTEGER;
BEGIN
  SELECT vt_seconds INTO actual_delay
  FROM pgflow_tests.message_timing(step_slug, queue_name)
  LIMIT 1;

  RETURN is(
    actual_delay,
    expected_delay,
    description
  );
END;
$$ language plpgsql;

/**
 * Helper functions for pruning tests.
 * Contains basic setup code that would otherwise be repeated.
 */

-- Set timestamps for completed runs/steps/tasks to be older than the cutoff
create or replace function pgflow_tests.set_completed_flow_timestamps(
  p_flow_slug text,
  days_old integer
) returns void language plpgsql as $$
begin
  -- Set timestamps for step_tasks
  update pgflow.step_tasks
  set
    queued_at = now() - interval '1 day' - (days_old * interval '1 day'),
    completed_at = now() - (days_old * interval '1 day'),
    status = 'completed'
  where flow_slug = p_flow_slug;

  -- Set timestamps for step_states
  update pgflow.step_states
  set
    created_at = now() - interval '2 days' - (days_old * interval '1 day'),
    started_at = now() - interval '1 day' - (days_old * interval '1 day'),
    completed_at = now() - (days_old * interval '1 day'),
    status = 'completed',
    remaining_tasks = 0
  where flow_slug = p_flow_slug;

  -- Set timestamps for runs
  update pgflow.runs
  set
    started_at = now() - interval '2 days' - (days_old * interval '1 day'),
    completed_at = now() - (days_old * interval '1 day'),
    status = 'completed',
    remaining_steps = 0
  where flow_slug = p_flow_slug;
end;
$$;

-- Set timestamps for failed runs/steps/tasks to be older than the cutoff
create or replace function pgflow_tests.set_failed_flow_timestamps(
  p_flow_slug text,
  days_old integer
) returns void language plpgsql as $$
begin
  -- Set timestamps for step_tasks
  update pgflow.step_tasks
  set
    queued_at = now() - interval '1 day' - (days_old * interval '1 day'),
    failed_at = now() - (days_old * interval '1 day'),
    status = 'failed',
    error_message = 'Test failure'
  where flow_slug = p_flow_slug;

  -- Set timestamps for step_states
  update pgflow.step_states
  set
    created_at = now() - interval '2 days' - (days_old * interval '1 day'),
    started_at = now() - interval '1 day' - (days_old * interval '1 day'),
    failed_at = now() - (days_old * interval '1 day'),
    status = 'failed'
  where flow_slug = p_flow_slug;

  -- Set timestamps for runs
  update pgflow.runs
  set
    started_at = now() - interval '2 days' - (days_old * interval '1 day'),
    failed_at = now() - (days_old * interval '1 day'),
    status = 'failed'
  where flow_slug = p_flow_slug;
end;
$$;

-- Set timestamps for running flows to be older than the cutoff
create or replace function pgflow_tests.set_running_flow_timestamps(
  p_flow_slug text,
  days_old integer
) returns void language plpgsql as $$
begin
  -- Set timestamps for step_tasks
  update pgflow.step_tasks
  set
    queued_at = now() - (days_old * interval '1 day'),
    status = 'queued'
  where flow_slug = p_flow_slug;

  -- Set timestamps for step_states
  update pgflow.step_states
  set
    created_at = now() - (days_old * interval '1 day'),
    started_at = now() - (days_old * interval '1 day'),
    status = 'started'
  where flow_slug = p_flow_slug;

  -- Set timestamps for runs
  update pgflow.runs
  set
    started_at = now() - (days_old * interval '1 day'),
    status = 'started'
  where flow_slug = p_flow_slug;
end;
$$;
--------------------------------------------------------------------------------
------- mock_realtime - mocks realtime.send for testing purposes --------------
--------------------------------------------------------------------------------

-- Create a table to store mock calls
create table if not exists pgflow_tests.realtime_calls (
  id serial primary key,
  payload jsonb,
  event text,
  topic text,
  private boolean,
  created_at timestamptz default NOW()
);

-- Function to capture realtime events
create or replace function pgflow_tests.capture_realtime_event(
  payload jsonb,
  event text,
  topic text,
  private boolean default false
) returns void as $$
BEGIN
  -- Store the realtime event details
  INSERT INTO pgflow_tests.realtime_calls(payload, event, topic, private)
  VALUES (payload, event, topic, private);
END;
$$ language plpgsql;

-- Function to set up realtime event monitoring
create or replace function pgflow_tests.mock_realtime() returns void as $$
BEGIN
  -- First, ensure the table is empty
  TRUNCATE pgflow_tests.realtime_calls;

  -- We will manually call the capture function in our tests
  -- since we can't replace the actual realtime.send function
END;
$$ language plpgsql;

-- Helper function to check if a realtime event was sent
create or replace function pgflow_tests.assert_realtime_event_sent(
  event_type text,
  description text
) returns text as $$
DECLARE
  count_value INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_value
  FROM pgflow_tests.realtime_calls
  WHERE payload->>'event_type' = event_type;

  RETURN is(
    count_value >= 1,
    TRUE,
    description
  );
END;
$$ language plpgsql;

-- Helper function to check if a realtime event was sent with specific step_slug
create or replace function pgflow_tests.assert_step_event_sent(
  event_type text,
  step_slug text,
  description text
) returns text as $$
DECLARE
  count_value INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_value
  FROM pgflow_tests.realtime_calls
  WHERE payload->>'event_type' = event_type
    AND payload->>'step_slug' = step_slug;

  RETURN is(
    count_value >= 1,
    TRUE,
    description
  );
END;
$$ language plpgsql;

-- Helper function to check if a run event was sent with specific flow_slug
create or replace function pgflow_tests.assert_run_event_sent(
  event_type text,
  flow_slug text,
  description text
) returns text as $$
DECLARE
  count_value INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_value
  FROM pgflow_tests.realtime_calls
  WHERE payload->>'event_type' = event_type
    AND payload->>'flow_slug' = flow_slug;

  RETURN is(
    count_value >= 1,
    TRUE,
    description
  );
END;
$$ language plpgsql;

-- Helper function to check if an event was sent for a specific run_id
create or replace function pgflow_tests.assert_run_id_event_sent(
  event_type text,
  run_id uuid,
  description text
) returns text as $$
DECLARE
  count_value INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_value
  FROM pgflow_tests.realtime_calls
  WHERE payload->>'event_type' = event_type
    AND payload->>'run_id' = run_id::TEXT;

  RETURN is(
    count_value >= 1,
    TRUE,
    description
  );
END;
$$ language plpgsql;

-- Helper function to check the topic pattern for an event
create or replace function pgflow_tests.assert_event_topic_pattern(
  event_type text,
  topic_pattern text,
  description text
) returns text as $$
DECLARE
  topic_value TEXT;
BEGIN
  SELECT topic
  INTO topic_value
  FROM pgflow_tests.realtime_calls
  WHERE payload->>'event_type' = event_type
  LIMIT 1;

  RETURN alike(
    topic_value,
    topic_pattern,
    description
  );
END;
$$ language plpgsql;

--------------------------------------------------------------------------------
------- create_realtime_partition - creates partition for realtime.messages ----
--------------------------------------------------------------------------------
/**
 * Creates a partition for the realtime.messages table for the current date.
 *
 * This function ensures the partition exists for the realtime.messages table,
 * which is required for realtime.send() to work properly. Without the appropriate
 * partition, realtime.send() will silently fail (it catches exceptions and sends
 * notifications instead of raising errors).
 *
 * The partition follows the naming convention: messages_YYYY_MM_DD
 * and covers the range from midnight of the target date to midnight of the next day.
 *
 * @param target_date The date to create the partition for. Defaults to current_date.
 * @return boolean TRUE if a partition was created, FALSE if it already existed
 */
create or replace function pgflow_tests.create_realtime_partition(
  target_date date default CURRENT_DATE
) returns boolean as $$
DECLARE
  next_date date := target_date + interval '1 day';
  partition_name text := 'messages_' || to_char(target_date, 'YYYY_MM_DD');
  partition_exists boolean;
  was_created boolean := false;
BEGIN
  -- Check if partition already exists
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'realtime'
    AND c.relname = partition_name
  ) INTO partition_exists;

  -- Create partition if it doesn't exist
  IF NOT partition_exists THEN
    BEGIN
      -- Create the partition for the target date
      EXECUTE format(
        'CREATE TABLE realtime.%I PARTITION OF realtime.messages
         FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        target_date,
        next_date
      );
      was_created := true;
      RAISE NOTICE 'Created partition % for date range % to %',
        partition_name, target_date, next_date;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error creating partition %: %', partition_name, SQLERRM;
      -- Re-throw the exception
      RAISE;
    END;
  ELSE
    RAISE NOTICE 'Partition % already exists', partition_name;
  END IF;

  RETURN was_created;
END;
$$ language plpgsql;

--------------------------------------------------------------------------------
------- find_realtime_event - finds a specific realtime event for testing ------
--------------------------------------------------------------------------------
/**
 * Finds a realtime event matching the specified criteria and returns its full payload.
 *
 * This is a test helper function that searches the realtime.messages table for
 * events matching the provided criteria. It's designed to be used in test assertions
 * to verify that specific realtime events were sent with the correct data.
 *
 * @param event_type The type of event to find (e.g., 'run:started', 'step:completed')
 * @param run_id The run ID associated with the event
 * @param step_slug Optional: The step slug to filter by (for step-related events)
 * @return The full jsonb payload of the matching event, or NULL if not found
 */
create or replace function pgflow_tests.find_realtime_event(
  event_type text,
  run_id uuid,
  step_slug text default null
) returns jsonb as $$
DECLARE
  event_payload jsonb;
BEGIN
  IF step_slug IS NULL THEN
    -- For run-level events (run:started, run:completed, run:failed)
    SELECT payload INTO event_payload
    FROM realtime.messages
    WHERE payload->>'event_type' = event_type
      AND payload->>'run_id' = run_id::text
    ORDER BY inserted_at DESC
    LIMIT 1;
  ELSE
    -- For step-level events (step:started, step:completed, step:failed)
    SELECT payload INTO event_payload
    FROM realtime.messages
    WHERE payload->>'event_type' = event_type
      AND payload->>'run_id' = run_id::text
      AND payload->>'step_slug' = step_slug
    ORDER BY inserted_at DESC
    LIMIT 1;
  END IF;

  RETURN event_payload;
END;
$$ language plpgsql;

/**
 * Counts realtime events matching the specified criteria.
 *
 * @param event_type The type of event to count (e.g., 'run:started', 'step:completed')
 * @param run_id The run ID associated with the event
 * @param step_slug Optional: The step slug to filter by (for step-related events)
 * @return The count of matching events
 */
create or replace function pgflow_tests.count_realtime_events(
  event_type text,
  run_id uuid,
  step_slug text default null
) returns integer as $$
DECLARE
  event_count integer;
BEGIN
  IF step_slug IS NULL THEN
    -- For run-level events
    SELECT COUNT(*)::int INTO event_count
    FROM realtime.messages
    WHERE payload->>'event_type' = event_type
      AND payload->>'run_id' = run_id::text;
  ELSE
    -- For step-level events
    SELECT COUNT(*)::int INTO event_count
    FROM realtime.messages
    WHERE payload->>'event_type' = event_type
      AND payload->>'run_id' = run_id::text
      AND payload->>'step_slug' = step_slug;
  END IF;

  RETURN event_count;
END;
$$ language plpgsql;

/**
 * Retrieves the full realtime message record matching specified criteria.
 *
 * This helper function returns the complete message record including topic and event
 * fields, which is useful for comprehensive testing of realtime notifications.
 * Written in declarative SQL style.
 *
 * @param event_type The type of event to find (e.g., 'run:started')
 * @param run_id The run ID associated with the event
 * @param step_slug Optional: The step slug to filter by (for step events)
 * @return The full message record including id, inserted_at, event, topic, and payload
 */
create or replace function pgflow_tests.get_realtime_message(
  event_type text,
  run_id uuid,
  step_slug text default null
) returns realtime.messages as $$
  SELECT * FROM realtime.messages
  WHERE payload->>'event_type' = event_type
    AND payload->>'run_id' = run_id::text
    AND (step_slug IS NULL OR payload->>'step_slug' = step_slug)
  ORDER BY inserted_at DESC
  LIMIT 1;
$$ language sql;

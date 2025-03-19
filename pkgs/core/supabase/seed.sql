create schema if not exists pgflow_tests;

--------------------------------------------------------------------------------
--------- reset_db - clears all tables and drops all queues --------------------
--------------------------------------------------------------------------------
create or replace function pgflow_tests.reset_db() returns void as $$
  DELETE FROM pgflow.step_tasks;
  DELETE FROM pgflow.step_states;
  DELETE FROM pgflow.runs;
  DELETE FROM pgflow.deps;
  DELETE FROM pgflow.steps;
  DELETE FROM pgflow.flows;

  SELECT pgmq.drop_queue(queue_name) FROM pgmq.list_queues();
$$ language sql;

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
  -- Poll for a task and complete it in one step
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

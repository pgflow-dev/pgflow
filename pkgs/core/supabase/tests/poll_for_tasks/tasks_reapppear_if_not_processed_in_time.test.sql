begin;
select * from plan(3);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run which will put a single task in the queue
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Poll a single task with visibility timeout (vt = 1)
select is(
  (select count(*)::integer from pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 1,
    qty => 1,
    max_poll_seconds => 1
  )),
  1::integer,
  'First poll should get the available task'
);

-- Wait longer than the visibility timeout
select pg_sleep(2);

-- TEST: Second poll should get the task again because visibility timeout expired
select is(
  (select count(*)::integer from pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 1,
    qty => 1,
    max_poll_seconds => 1
  )),
  1::integer,
  'Second poll should get the task again after visibility timeout expired'
);

-- Verify the task was re-polled (should be the same task)
select is(
  (
    select count(*)::integer from pgflow.step_tasks
    where status = 'queued' and step_slug = 'first'
  ),
  1::integer,
  'Same task should be marked as '
);

select * from finish();
rollback;

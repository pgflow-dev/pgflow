begin;
select * from plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run which will put a single task in the queue
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Poll a single task with big visibility timeout (vt = 10)
select is(
  (select count(*)::integer from pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 1,
    max_poll_seconds => 1
  )),
  1::integer,
  'First poll should get the available task'
);

-- TEST: Immediate second poll (simulating concurrent access) should get nothing
-- because the message is hidden with vt=5
select is(
  (select count(*)::integer from pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 1,
    max_poll_seconds => 1
  )),
  0::integer,
  'Concurrent poll should not get the same task (due to visibility timeout)'
);

select * from finish();
rollback;

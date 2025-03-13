begin;
select * from plan(1);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run which will put a task in the queue
select pgflow.start_flow('sequential', '{"id": 1}'::jsonb);

-- TEST: Calling with qty = 0 should return no tasks
select is(
  (select count(*)::integer from pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 0,
    max_poll_seconds => 1
  )),
  0::integer,
  'Should return no tasks when qty=0'
);

select * from finish();
rollback;

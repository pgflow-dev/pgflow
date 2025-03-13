begin;
select plan(1);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start multiple flow runs which will put multiple tasks in the queue
select pgflow.start_flow('sequential', '{"id": 1}'::jsonb);
select pgflow.start_flow('sequential', '{"id": 2}'::jsonb);
select pgflow.start_flow('sequential', '{"id": 3}'::jsonb);

-- TEST: Poll multiple tasks at once (qty = 3)
select is(
  (select count(*)::integer from pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 3,
    max_poll_seconds => 1
  )),
  3::integer,
  'Should return 3 tasks when qty=3 and 3 tasks are available'
);

select finish();
rollback;

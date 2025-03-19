begin;
select * from plan(1);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- TEST: Polling from an empty queue returns no tasks
select is(
  (select count(*)::integer from pgflow.poll_for_tasks(
    queue_name => 'sequential'::text,
    vt => 5,
    qty => 10,
    max_poll_seconds => 1
  )),
  0::integer,
  'Should return no tasks when queue is empty'
);

select * from finish();
rollback;

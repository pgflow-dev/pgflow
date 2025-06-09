begin;
select plan(2);
select pgflow_tests.reset_db();

select pgflow.create_flow('simple');
select pgflow.add_step('simple', 'task');
select pgflow.start_flow('simple', '"hello"'::jsonb);

-- SETUP: Start the task first time (should return 1 task)
select is(
  (select count(*) from pgflow_tests.read_and_start('simple', 30, 5)),
  1::bigint,
  'First read_and_start should return 1 task (initial task status: queued)'
);

-- TEST: Second read_and_start should return 0 tasks (task now started)
select is(
  (select count(*) from pgflow_tests.read_and_start('simple', 1, 5)),
  0::bigint,
  'Second read_and_start should return 0 tasks (task status after first start: started)'
);

select finish();
rollback;
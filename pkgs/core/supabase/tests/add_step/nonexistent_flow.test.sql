begin;
select plan(1);
select pgflow_tests.reset_db();

-- Test
select throws_ok(
  $$ SELECT pgflow.add_step('nonexistent_flow', 'some_step') $$,
  'Flow nonexistent_flow does not exist',
  'Should not allow adding step to non-existent flow'
);

select * from finish();
rollback;

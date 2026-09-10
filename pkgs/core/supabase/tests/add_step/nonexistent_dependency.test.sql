begin;
select plan(1);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');

-- Test
select throws_ok(
  $$ SELECT pgflow.add_step('test_flow', 'invalid_dep_step', ARRAY['nonexistent_step']) $$,
  'Flow test_flow: step "invalid_dep_step" has a dependency that does not exist',
  'Should detect and prevent dependency on non-existent step'
);

select * from finish();
rollback;

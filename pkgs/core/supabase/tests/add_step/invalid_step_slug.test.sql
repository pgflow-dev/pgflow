begin;
select plan(1);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');

-- Test
select throws_ok(
  $$ SELECT pgflow.add_step('test_flow', '1invalid-slug') $$,
  'new row for relation "steps" violates check constraint "steps_step_slug_check"',
  'Should detect and prevent invalid step slug'
);

select * from finish();
rollback;

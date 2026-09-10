begin;
select plan(1);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');

-- Test
select throws_ok(
  $$ SELECT pgflow.add_step('test_flow', '1invalid-slug') $$,
  'Flow test_flow: "1invalid-slug" is not a valid step slug',
  'Should detect and prevent invalid step slug'
);

select * from finish();
rollback;

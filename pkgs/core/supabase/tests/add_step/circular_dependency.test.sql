begin;
select plan(1);
select pgflow_tests.reset_db();

-- Setup
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first_step');
select pgflow.add_step('test_flow', 'second_step', array['first_step']);
select pgflow.add_step('test_flow', 'third_step', array['second_step']);
select
  pgflow.add_step('test_flow', 'fourth_step', array['second_step', 'third_step']);

-- Test
select throws_ok(
  $$ SELECT pgflow.add_step('test_flow', 'circular_step', ARRAY['fourth_step', 'circular_step']) $$,
  'new row for relation "deps" violates check constraint "deps_check"',
  'Should not allow self-depending steps'
);

select * from finish();
rollback;

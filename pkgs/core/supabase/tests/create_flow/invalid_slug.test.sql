begin;
select plan(1);
select pgflow_tests.reset_db();

-- TEST: Should detect and prevent invalid flow slug
select throws_ok(
  $$ SELECT pgflow.create_flow('invalid-flow') $$,
  'new row for relation "flows" violates check constraint "slug_is_valid"',
  'Should detect and prevent invalid flow slug'
);

select * from finish();
rollback;

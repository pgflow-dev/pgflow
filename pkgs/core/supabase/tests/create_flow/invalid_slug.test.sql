begin;
select plan(1);
select pgflow_tests.reset_db();

-- TEST: Should detect and prevent invalid flow slug
select throws_ok(
  $$ SELECT pgflow.create_flow('invalid-flow') $$,
  'Flow invalid-flow: "invalid-flow" is not a valid generated queue name (lowercase, at most 47 characters, starting with a letter)',
  'Should detect and prevent invalid flow slug'
);

select * from finish();
rollback;

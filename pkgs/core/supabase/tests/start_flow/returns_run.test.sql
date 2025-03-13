begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');
select pgflow_tests.setup_flow('two_roots');

-- TEST: start_flow() returns started step states
select results_eq(
  $$ SELECT flow_slug, status, input
       FROM pgflow.start_flow('sequential', '"hello"'::jsonb) $$,
  $$ VALUES ('sequential', 'started', '"hello"'::jsonb) $$,
  'start_flow() should return a run'
);

-- TEST: start_flow() returns started step states
select results_eq(
  $$ SELECT flow_slug, status, input
       FROM pgflow.start_flow('sequential', '"world"'::jsonb) $$,
  $$ VALUES ('sequential', 'started', '"world"'::jsonb) $$,
  'start_flow() should return a single run even for flow that have two root steps'
);

select finish();
rollback;

begin;
select plan(1);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('two_roots');

-- Start the flow and complete the root steps
select pgflow.start_flow('two_roots', '"root input"'::jsonb);
select pgflow.poll_for_tasks('two_roots', 1, 2);
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'root_a',
  0,
  '"root_a output"'::jsonb
);
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'root_b',
  0,
  '"root_b output"'::jsonb
);

-- TEST: Verify that the queued message have the proper input
select is(
  (select input from pgflow.poll_for_tasks('two_roots', 1, 1)),
  jsonb_build_object(
    'run', '"root input"'::jsonb,
    'root_a', '"root_a output"'::jsonb,
    'root_b', '"root_b output"'::jsonb
  )
);

select finish();
rollback;


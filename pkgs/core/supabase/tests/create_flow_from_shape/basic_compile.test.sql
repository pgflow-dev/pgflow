begin;
select plan(4);
select pgflow_tests.reset_db();

-- Test: Compile a simple sequential flow from shape
select pgflow._create_flow_from_shape(
  'test_flow',
  '{
    "steps": [
      {"slug": "first", "stepType": "single", "dependencies": []},
      {"slug": "second", "stepType": "single", "dependencies": ["first"]},
      {"slug": "third", "stepType": "single", "dependencies": ["second"]}
    ]
  }'::jsonb
);

-- Verify flow was created
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'test_flow'),
  1,
  'Flow should be created'
);

-- Verify steps were created
select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'test_flow'),
  3,
  'All 3 steps should be created'
);

-- Verify step order matches (step_index)
select results_eq(
  $$ SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_index $$,
  $$ VALUES ('first'), ('second'), ('third') $$,
  'Steps should be in correct order'
);

-- Verify dependencies were created
select results_eq(
  $$ SELECT dep_slug, step_slug FROM pgflow.deps WHERE flow_slug = 'test_flow' ORDER BY step_slug $$,
  $$ VALUES ('first', 'second'), ('second', 'third') $$,
  'Dependencies should be created correctly'
);

select finish();
rollback;

begin;
select plan(1);
select pgflow_tests.reset_db();

-- Test: Different step types at same index should be detected
select ok(
  $$Step at index 0: type differs 'single' vs 'map'$$ = ANY(
    pgflow._compare_flow_shapes(
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb,
      '{
        "steps": [
          {"slug": "first", "stepType": "map", "dependencies": []}
        ]
      }'::jsonb
    )
  ),
  'Should detect step type difference'
);

select finish();
rollback;

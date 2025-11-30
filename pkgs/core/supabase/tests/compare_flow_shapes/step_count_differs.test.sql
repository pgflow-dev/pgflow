begin;
select plan(1);
select pgflow_tests.reset_db();

-- Test: Different step counts should be detected
select ok(
  'Step count differs: 2 vs 1' = ANY(
    pgflow._compare_flow_shapes(
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": []},
          {"slug": "second", "stepType": "single", "dependencies": ["first"]}
        ]
      }'::jsonb,
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb
    )
  ),
  'Should detect step count difference'
);

select finish();
rollback;

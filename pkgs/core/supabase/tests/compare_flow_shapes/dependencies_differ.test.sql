begin;
select plan(1);
select pgflow_tests.reset_db();

-- Test: Different dependencies at same index should be detected
select ok(
  $$Step at index 1: dependencies differ [alpha] vs [beta]$$ = ANY(
    pgflow._compare_flow_shapes(
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": []},
          {"slug": "second", "stepType": "single", "dependencies": ["alpha"]}
        ]
      }'::jsonb,
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": []},
          {"slug": "second", "stepType": "single", "dependencies": ["beta"]}
        ]
      }'::jsonb
    )
  ),
  'Should detect dependency difference'
);

select finish();
rollback;

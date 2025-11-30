begin;
select plan(1);
select pgflow_tests.reset_db();

-- Test: Different slugs at same index should be detected
select ok(
  $$Step at index 0: slug differs 'first' vs 'different'$$ = ANY(
    pgflow._compare_flow_shapes(
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb,
      '{
        "steps": [
          {"slug": "different", "stepType": "single", "dependencies": []}
        ]
      }'::jsonb
    )
  ),
  'Should detect slug difference at same index'
);

select finish();
rollback;

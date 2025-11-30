begin;
select plan(1);
select pgflow_tests.reset_db();

-- Test: Identical shapes should return empty differences array
select is(
  pgflow._compare_flow_shapes(
    '{
      "steps": [
        {"slug": "first", "stepType": "single", "dependencies": []},
        {"slug": "second", "stepType": "single", "dependencies": ["first"]}
      ]
    }'::jsonb,
    '{
      "steps": [
        {"slug": "first", "stepType": "single", "dependencies": []},
        {"slug": "second", "stepType": "single", "dependencies": ["first"]}
      ]
    }'::jsonb
  ),
  '{}'::text[],
  'Identical shapes should have no differences'
);

select finish();
rollback;

begin;
select plan(5);

select pgflow_tests.reset_db();

select lives_ok(
  $$
    select pgflow._create_flow_from_shape(
      p_flow_slug => 'legacy_shape_defaults',
      p_shape => '{
        "steps": [
          {
            "slug": "first",
            "stepType": "single",
            "dependencies": []
          }
        ]
      }'::jsonb
    )
  $$,
  'legacy shape without condition mode fields should compile'
);

select is(
  (
    select when_unmet
    from pgflow.steps
    where flow_slug = 'legacy_shape_defaults'
      and step_slug = 'first'
  ),
  'skip',
  'missing whenUnmet should default to skip'
);

select is(
  (
    select when_exhausted
    from pgflow.steps
    where flow_slug = 'legacy_shape_defaults'
      and step_slug = 'first'
  ),
  'fail',
  'missing whenExhausted should default to fail'
);

select ok(
  (
    select required_input_pattern is null
    from pgflow.steps
    where flow_slug = 'legacy_shape_defaults'
      and step_slug = 'first'
  ),
  'required_input_pattern should remain null when omitted'
);

select ok(
  (
    select forbidden_input_pattern is null
    from pgflow.steps
    where flow_slug = 'legacy_shape_defaults'
      and step_slug = 'first'
  ),
  'forbidden_input_pattern should remain null when omitted'
);

select finish();
rollback;

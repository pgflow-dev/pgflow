BEGIN;

SELECT plan(1);

-- Create a test flow
SELECT pgflow.create_flow('test_flow');

-- Test: Invalid step_type should be rejected - use throws_like to match constraint error
SELECT throws_like($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'invalid_step',
    deps_slugs => '{}',
    step_type => 'invalid_type'
  );
$$, '%steps_step_type_check%', 'Should reject invalid step_type');

SELECT * FROM finish();

ROLLBACK;
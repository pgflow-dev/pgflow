BEGIN;

SELECT plan(5);

-- Create a test flow
SELECT pgflow.create_flow('test_flow');

-- Test 1: Can create map step with step_type parameter
SELECT lives_ok($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'map_step',
    deps_slugs => '{}',
    max_attempts => 3,
    base_delay => 1,
    timeout => 60,
    start_delay => 0,
    step_type => 'map'
  );
$$, 'Should be able to create map step with step_type parameter');

-- Test 2: Map step is created with correct step_type
SELECT is(
  (SELECT step_type FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'map_step'),
  'map',
  'Map step should have step_type = "map"'
);

-- Test 3: Can create single step (default behavior)
SELECT lives_ok($$
  SELECT pgflow.add_step('test_flow', 'single_step', '{}'::text[]);
$$, 'Should be able to create single step with default step_type');

-- Test 4: Single step defaults to step_type = 'single'
SELECT is(
  (SELECT step_type FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'single_step'),
  'single',
  'Single step should default to step_type = "single"'
);

-- Test 5: Can explicitly create single step
SELECT lives_ok($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'explicit_single',
    deps_slugs => '{}',
    step_type => 'single'
  );
$$, 'Should be able to explicitly create single step');

SELECT * FROM finish();

ROLLBACK;
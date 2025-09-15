BEGIN;

SELECT plan(5);

-- Create a test flow
SELECT pgflow.create_flow('test_flow');

-- Test 1: Root map step creation
SELECT lives_ok($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'root_map_step',
    deps_slugs => '{}',
    step_type => 'map'
  );
$$, 'Should be able to create root map step (no dependencies)');

-- Test 2: Verify step properties
SELECT is(
  (SELECT step_type FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'root_map_step'),
  'map',
  'Root map step should have step_type = "map"'
);

SELECT is(
  (SELECT deps_count FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'root_map_step'),
  0,
  'Root map step should have deps_count = 0'
);

-- Test 3: Root map step with NULL deps_slugs should also work
SELECT lives_ok($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'root_map_null_deps',
    deps_slugs => NULL,
    step_type => 'map'
  );
$$, 'Should be able to create root map step with NULL deps_slugs');

-- Verify NULL deps_slugs results in deps_count = 0
SELECT is(
  (SELECT deps_count FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'root_map_null_deps'),
  0,
  'Root map step with NULL deps_slugs should have deps_count = 0'
);

SELECT * FROM finish();

ROLLBACK;
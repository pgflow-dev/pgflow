BEGIN;

SELECT plan(8);

-- Create a test flow with dependencies
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.add_step('test_flow', 'dep1', '{}'::text[], null, null, null, null, 'single');
SELECT pgflow.add_step('test_flow', 'dep2', '{}'::text[], null, null, null, null, 'single');
SELECT pgflow.add_step('test_flow', 'dep3', '{}'::text[], null, null, null, null, 'single');

-- Test 1: Map step with no dependencies should work (root map)
SELECT lives_ok($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'root_map',
    deps_slugs => '{}',
    step_type => 'map'
  );
$$, 'Map step with no dependencies should work (root map)');

-- Test 2: Map step with 1 dependency should work (dependent map)
SELECT lives_ok($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'dependent_map',
    deps_slugs => '{dep1}',
    step_type => 'map'
  );
$$, 'Map step with 1 dependency should work (dependent map)');

-- Test 3: Map step with 2 dependencies should be rejected
SELECT throws_ok($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'invalid_map',
    deps_slugs => '{dep1,dep2}',
    step_type => 'map'
  );
$$, 'Map step "invalid_map" can have at most one dependency, but 2 were provided: dep1, dep2', 'Map step with 2 dependencies should be rejected');

-- Test 4: Map step with 3 dependencies should be rejected
SELECT throws_ok($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'invalid_map2',
    deps_slugs => '{dep1,dep2,dep3}',
    step_type => 'map'
  );
$$, 'Map step "invalid_map2" can have at most one dependency, but 3 were provided: dep1, dep2, dep3', 'Map step with 3 dependencies should be rejected');

-- Test 5: Single step with multiple dependencies should still work
SELECT lives_ok($$
  SELECT pgflow.add_step(
    flow_slug => 'test_flow',
    step_slug => 'multi_dep_single',
    deps_slugs => '{dep1,dep2,dep3}',
    step_type => 'single'
  );
$$, 'Single step with multiple dependencies should still work');

-- Test 6: Verify created steps have correct dependency counts
SELECT is(
  (SELECT deps_count FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'root_map'),
  0,
  'Root map should have 0 dependencies'
);

SELECT is(
  (SELECT deps_count FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'dependent_map'),
  1,
  'Dependent map should have 1 dependency'
);

SELECT is(
  (SELECT deps_count FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'multi_dep_single'),
  3,
  'Multi-dependency single step should have 3 dependencies'
);

SELECT * FROM finish();

ROLLBACK;
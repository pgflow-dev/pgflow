BEGIN;
SELECT plan(13);

DELETE FROM pgflow.deps;
DELETE FROM pgflow.steps;
DELETE FROM pgflow.flows;

-- Create flows first
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.create_flow('another_flow');

-- Test 1: Basic step addition with no dependencies
SELECT pgflow.add_step('test_flow', 'first_step');
SELECT results_eq(
    $$ SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' $$,
    ARRAY['first_step']::text[],
    'Step should be added to the steps table'
);
SELECT is_empty(
    $$ SELECT * FROM pgflow.deps WHERE flow_slug = 'test_flow' $$,
    'No dependencies should be added for step with no dependencies'
);

-- Test 2: Step addition with valid existing dependencies
SELECT pgflow.add_step('test_flow', 'second_step', ARRAY['first_step']);
SELECT results_eq(
    $$ SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_slug $$,
    ARRAY['first_step', 'second_step']::text[],
    'Second step should be added to the steps table'
);
SELECT results_eq(
    $$
      SELECT dep_slug, step_slug
      FROM pgflow.deps WHERE flow_slug = 'test_flow'
      ORDER BY dep_slug, step_slug
    $$,
    $$ VALUES ('first_step', 'second_step') $$,
    'Dependency should be recorded in deps table'
);

-- Test 3: Multiple steps added in topological order
SELECT pgflow.add_step('test_flow', 'third_step', ARRAY['second_step']);
SELECT pgflow.add_step('test_flow', 'fourth_step', ARRAY['second_step', 'third_step']);
SELECT results_eq(
    $$
      SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_slug
    $$,
    ARRAY['first_step', 'fourth_step', 'second_step', 'third_step']::text[],
    'All steps should be in the steps table'
);
SELECT set_eq(
    $$
      SELECT dep_slug, step_slug
      FROM pgflow.deps
      WHERE flow_slug = 'test_flow'
    $$,
    $$ VALUES
       ('first_step', 'second_step'),
       ('second_step', 'third_step'),
       ('second_step', 'fourth_step'),
       ('third_step', 'fourth_step')
    $$,
    'All dependencies should be correctly recorded'
);

-- Test 4: Steps added to different flows are isolated
SELECT pgflow.add_step('another_flow', 'first_step');
SELECT pgflow.add_step('another_flow', 'another_step', ARRAY['first_step']);
SELECT set_eq(
    $$
      SELECT flow_slug, step_slug
      FROM pgflow.steps WHERE flow_slug = 'another_flow'
    $$,
    $$ VALUES
       ('another_flow', 'another_step'),
       ('another_flow', 'first_step')
    $$,
    'Steps in second flow should be isolated from first flow'
);

-- Test 5: Idempotent step addition (ignore duplicates)
SELECT pgflow.add_step('test_flow', 'first_step');
SELECT results_eq(
    $$
      SELECT count(*)::int FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'first_step'
    $$,
    ARRAY[1]::int[],
    'Calling add_step again for same step does not create a duplicate'
);

-- Test 6: Circular dependency detection
SELECT throws_ok(
    $$ SELECT pgflow.add_step('test_flow', 'circular_step', ARRAY['fourth_step', 'circular_step']) $$,
    'new row for relation "deps" violates check constraint "deps_check"',
    'Should not allow self-depending steps'
);

-- Test 7: Non-existent dependency step
SELECT throws_ok(
    $$ SELECT pgflow.add_step('test_flow', 'invalid_dep_step', ARRAY['nonexistent_step']) $$,
    'insert or update on table "deps" violates foreign key constraint "deps_flow_slug_dep_slug_fkey"',
    'Should detect and prevent dependency on non-existent step'
);

-- Test 8: Invalid slug format
SELECT throws_ok(
    $$ SELECT pgflow.add_step('test_flow', '1invalid-slug') $$,
    'new row for relation "steps" violates check constraint "steps_step_slug_check"',
    'Should detect and prevent invalid step slug'
);

SELECT throws_ok(
    $$ SELECT pgflow.add_step('invalid-flow', 'step') $$,
    'new row for relation "steps" violates check constraint "steps_flow_slug_check"',
    'Should detect and prevent invalid flow slug'
);

-- Test 9: Cannot add step to non-existent flow
SELECT throws_ok(
    $$ SELECT pgflow.add_step('nonexistent_flow', 'some_step') $$,
    'insert or update on table "steps" violates foreign key constraint "steps_flow_slug_fkey"',
    'Should not allow adding step to non-existent flow'
);

SELECT * FROM finish();
ROLLBACK;

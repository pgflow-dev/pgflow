begin;
select plan(9);

-- Create test flow with single -> map dependency
select pgflow.create_flow('test_dependent_map_null');

select pgflow.add_step(
  flow_slug => 'test_dependent_map_null',
  step_slug => 'producer',
  step_type => 'single'
);

select pgflow.add_step(
  flow_slug => 'test_dependent_map_null',
  step_slug => 'map_consumer',
  deps_slugs => '{"producer"}',
  step_type => 'map'
);

-- Start flow
select pgflow.start_flow(
  'test_dependent_map_null',
  '{"some": "input"}'::jsonb
);

-- Test: producer step should have initial_tasks = 1
select is(
  initial_tasks,
  1,
  'Single step producer should have initial_tasks = 1'
)
from pgflow.step_states
where step_slug = 'producer';

-- Test: dependent map should have NULL initial_tasks initially
select is(
  initial_tasks,
  NULL,
  'Dependent map should have NULL initial_tasks before dependency completes'
)
from pgflow.step_states
where step_slug = 'map_consumer';

-- Test: dependent map should not be ready to start
select is(
  status,
  'created',
  'Dependent map should remain in created status with NULL initial_tasks'
)
from pgflow.step_states
where step_slug = 'map_consumer';

-- Complete the producer task with array output
-- First start the task (simulating worker polling)
WITH task AS (
  SELECT * FROM pgflow_tests.read_and_start('test_dependent_map_null') LIMIT 1
)
-- Then complete it with array output
SELECT pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,  -- task_index is always 0 for single steps
  '["item1", "item2", "item3"]'::jsonb
)
FROM task;

-- Test: dependent map should now have initial_tasks = 3
select is(
  initial_tasks,
  3,
  'Dependent map should have initial_tasks = 3 after producer completes with 3-element array'
)
from pgflow.step_states
where step_slug = 'map_consumer';

-- Test: dependent map should be ready to start
select is(
  remaining_deps,
  0,
  'Dependent map should have remaining_deps = 0 after producer completes'
)
from pgflow.step_states
where step_slug = 'map_consumer';

-- Test case 2: Empty array propagation
select pgflow.create_flow('test_empty_array_null');

select pgflow.add_step(
  flow_slug => 'test_empty_array_null',
  step_slug => 'producer2',
  step_type => 'single'
);

select pgflow.add_step(
  flow_slug => 'test_empty_array_null',
  step_slug => 'map_consumer2',
  deps_slugs => '{"producer2"}',
  step_type => 'map'
);

select pgflow.start_flow(
  'test_empty_array_null',
  '{"test": "data"}'::jsonb
);

-- Test: map starts with NULL
select is(
  initial_tasks,
  NULL,
  'Second dependent map should have NULL initial_tasks initially'
)
from pgflow.step_states
where step_slug = 'map_consumer2';

-- Complete the producer2 task with empty array output
WITH task AS (
  SELECT * FROM pgflow_tests.read_and_start('test_empty_array_null') LIMIT 1
)
SELECT pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,  -- task_index
  '[]'::jsonb  -- Empty array
)
FROM task;

-- Test: dependent map should have initial_tasks = 0 (not NULL)
select is(
  initial_tasks,
  0,
  'Dependent map should have initial_tasks = 0 (not NULL) after producer completes with empty array'
)
from pgflow.step_states
where step_slug = 'map_consumer2';

-- Test: dependent map with 0 tasks should auto-complete
select is(
  status,
  'completed',
  'Dependent map with initial_tasks = 0 should auto-complete via cascade'
)
from pgflow.step_states
where step_slug = 'map_consumer2';

-- Test: Verify constraint exists using information_schema
select ok(
  EXISTS (
    SELECT 1
    FROM information_schema.check_constraints
    WHERE constraint_schema = 'pgflow'
      AND constraint_name = 'initial_tasks_known_when_started'
  ),
  'Table should have constraint preventing starting with NULL initial_tasks'
);

select * from finish();
rollback;
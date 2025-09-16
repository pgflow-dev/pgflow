begin;
select plan(6);
select pgflow_tests.reset_db();

-- SETUP: Create flow with ONLY map steps (no single steps)
select pgflow.create_flow('maps_only_flow');

-- Add first root map
select pgflow.add_step(
  flow_slug => 'maps_only_flow', 
  step_slug => 'map_one', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- Add second root map  
select pgflow.add_step(
  flow_slug => 'maps_only_flow', 
  step_slug => 'map_two', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- Add dependent map (depends on first map)
select pgflow.add_step(
  flow_slug => 'maps_only_flow', 
  step_slug => 'map_three', 
  deps_slugs => array['map_one'],
  step_type => 'map'
);

-- TEST: Flow with only maps should start successfully
select lives_ok(
  $$ select pgflow.start_flow('maps_only_flow', '[1, 2, 3, 4]'::jsonb) $$,
  'Flow with only map steps should start successfully'
);

-- TEST: Verify run was created
select ok(
  exists(select 1 from pgflow.runs where flow_slug = 'maps_only_flow'),
  'Run should be created for flow with only map steps'
);

-- TEST: All root maps should have same initial_tasks
select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'map_one' limit 1),
  4,
  'First root map should have initial_tasks = 4'
);

select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'map_two' limit 1),
  4,
  'Second root map should have initial_tasks = 4'
);

-- TEST: Dependent map should have initial_tasks = NULL (will be updated when map_one completes)
select is(
  (select initial_tasks from pgflow.step_states
   where step_slug = 'map_three' limit 1),
  NULL::integer,
  'Dependent map should have initial_tasks = NULL initially (will be updated when dependency completes)'
);

-- TEST: All steps should have correct status
-- Note: start_flow calls start_ready_steps, so root maps will be 'started'
select results_eq(
  $$ 
    SELECT step_slug, status, remaining_deps 
    FROM pgflow.step_states 
    WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'maps_only_flow' LIMIT 1)
    ORDER BY step_slug 
  $$,
  $$ 
    VALUES 
      ('map_one', 'started', 0),
      ('map_three', 'created', 1),
      ('map_two', 'started', 0)
  $$,
  'Root map steps should be started, dependent map should be created'
);

select finish();
rollback;
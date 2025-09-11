begin;
select plan(5);
select pgflow_tests.reset_db();

-- SETUP: Create flow with mixed step types (single and map)
select pgflow.create_flow('mixed_flow');

-- Add root single step
select pgflow.add_step(
  flow_slug => 'mixed_flow', 
  step_slug => 'single_root', 
  deps_slugs => '{}',
  step_type => 'single'
);

-- Add root map step
select pgflow.add_step(
  flow_slug => 'mixed_flow', 
  step_slug => 'map_root', 
  deps_slugs => '{}',
  step_type => 'map'
);

-- Add dependent single step
select pgflow.add_step(
  flow_slug => 'mixed_flow', 
  step_slug => 'single_dependent', 
  deps_slugs => array['single_root', 'map_root'],
  step_type => 'single'
);

-- TEST: Start flow with array input (required for root map)
select pgflow.start_flow('mixed_flow', '["a", "b"]'::jsonb);

-- TEST: Verify run was created
select ok(
  exists(select 1 from pgflow.runs where flow_slug = 'mixed_flow'),
  'Run should be created for mixed flow'
);

-- TEST: Single root step should have initial_tasks = 1
select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'single_root' limit 1),
  1,
  'Single root step should have initial_tasks = 1'
);

-- TEST: Map root step should have initial_tasks = array length
select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'map_root' limit 1),
  2,
  'Map root step should have initial_tasks = 2 for array with 2 elements'
);

-- TEST: Dependent single step should have initial_tasks = 1
select is(
  (select initial_tasks from pgflow.step_states 
   where step_slug = 'single_dependent' limit 1),
  1,
  'Dependent single step should have initial_tasks = 1'
);

-- TEST: All steps should have correct remaining_deps
select results_eq(
  $$ 
    SELECT step_slug, remaining_deps 
    FROM pgflow.step_states 
    WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
    ORDER BY step_slug 
  $$,
  $$ 
    VALUES 
      ('map_root', 0),
      ('single_dependent', 2),
      ('single_root', 0)
  $$,
  'All steps should have correct remaining_deps'
);

select finish();
rollback;
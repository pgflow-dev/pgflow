begin;
select plan(6);
select pgflow_tests.reset_db();

-- Test: Map tasks correctly handle large arrays (100+ elements)
select diag('Testing map tasks with large arrays');

-- SETUP: Create flow with root map
select pgflow.create_flow('large_array_flow');
select pgflow.add_step(
  flow_slug => 'large_array_flow',
  step_slug => 'large_map',
  deps_slugs => '{}',
  step_type => 'map'
);

-- Start flow with array of 150 elements
select run_id from pgflow.start_flow(
  'large_array_flow',
  (select jsonb_agg(i) from generate_series(1, 150) i)
) \gset

-- Verify 150 tasks were created
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'run_id' and step_slug = 'large_map'),
  150::bigint,
  'Should create 150 tasks for array with 150 elements'
);

-- Ensure worker exists
select pgflow_tests.ensure_worker('large_array_flow');

-- Sample check: verify specific indices receive correct elements
-- Check index 0 (first)
select message_id as msg_id_0 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'large_map' and task_index = 0 \gset

select is(
  (select input from pgflow.start_tasks(
    'large_array_flow',
    ARRAY[:'msg_id_0'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '1'::jsonb,
  'Task at index 0 should receive element 1'
);

-- Check index 49 (middle)
select message_id as msg_id_49 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'large_map' and task_index = 49 \gset

select is(
  (select input from pgflow.start_tasks(
    'large_array_flow',
    ARRAY[:'msg_id_49'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '50'::jsonb,
  'Task at index 49 should receive element 50'
);

-- Check index 99
select message_id as msg_id_99 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'large_map' and task_index = 99 \gset

select is(
  (select input from pgflow.start_tasks(
    'large_array_flow',
    ARRAY[:'msg_id_99'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '100'::jsonb,
  'Task at index 99 should receive element 100'
);

-- Check index 149 (last)
select message_id as msg_id_149 from pgflow.step_tasks
where run_id = :'run_id' and step_slug = 'large_map' and task_index = 149 \gset

select is(
  (select input from pgflow.start_tasks(
    'large_array_flow',
    ARRAY[:'msg_id_149'::bigint],
    '11111111-1111-1111-1111-111111111111'::uuid
  )),
  '150'::jsonb,
  'Task at index 149 should receive element 150'
);

-- Verify all task indices are sequential from 0 to 149
select is(
  (select array_agg(task_index order by task_index) = array_agg(generate_series order by generate_series)
   from pgflow.step_tasks st
   cross join generate_series(0, 149)
   where st.run_id = :'run_id' and st.step_slug = 'large_map'),
  true,
  'All task indices should be sequential from 0 to 149'
);

select finish();
rollback;
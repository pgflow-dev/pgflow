begin;
select plan(3);

-- Test: Empty map output aggregation
-- Map with 0 tasks should produce empty array []

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_empty', 10, 60, 3);
select pgflow.add_step('test_empty', 'empty_map', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_empty', 'consumer', array['empty_map'], null, null, null, null, 'single');

-- Start flow with empty array
select is(
  (select count(*) from pgflow.start_flow('test_empty', '[]'::jsonb)),
  1::bigint,
  'Flow should start with empty array'
);

-- Verify map step completed immediately (taskless)
select is(
  (select status from pgflow.step_states
   where step_slug = 'empty_map'),
  'completed',
  'Empty map should auto-complete'
);

-- Trigger dependent step and check input
do $$
declare
  v_run_id uuid;
begin
  select run_id into v_run_id from pgflow.runs limit 1;
  -- Trigger dependent step (should already be triggered but just in case)
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Check that consumer receives empty array
select is(
  (select input->'empty_map' from pgflow_tests.read_and_start('test_empty', 1, 1)),
  '[]'::jsonb,
  'Consumer should receive empty array from empty map'
);

select * from finish();
rollback;
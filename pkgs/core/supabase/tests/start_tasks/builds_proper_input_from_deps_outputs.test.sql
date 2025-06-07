begin;
select plan(3);
select pgflow_tests.reset_db();

-- SETUP: Create flow with dependencies
select pgflow.create_flow('dep_flow');
select pgflow.add_step('dep_flow', 'first');
select pgflow.add_step('dep_flow', 'second', array['first']);
select pgflow.start_flow('dep_flow', '{"input": "value"}'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('dep_flow');

-- SETUP: Complete the first step to make second step available
with first_msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('dep_flow', 10, 5, 1, 100)
)
select pgflow.start_tasks(
  (select ids from first_msg_ids),
  '11111111-1111-1111-1111-111111111111'::uuid
);

select pgflow.complete_task(
  run_id => (select run_id from pgflow.runs where flow_slug = 'dep_flow'),
  step_slug => 'first',
  task_index => 0,
  output => '{"first_output": "completed"}'::jsonb
);

-- TEST: start_tasks returns a task for the dependent step
with second_msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('dep_flow', 10, 5, 1, 100)
)
select is(
  (select count(*)::int from pgflow.start_tasks(
    (select ids from second_msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  ) where step_slug = 'second'),
  1,
  'start_tasks should return one task for dependent step'
);

-- TEST: The dependent step task is now started
select is(
  (select status from pgflow.step_tasks where step_slug = 'second'),
  'started',
  'Dependent step should be in started status after start_tasks'
);

-- TEST: The dependent step has started_at timestamp
select ok(
  (select started_at is not null from pgflow.step_tasks where step_slug = 'second'),
  'Dependent step should have started_at timestamp'
);

select finish();
rollback;
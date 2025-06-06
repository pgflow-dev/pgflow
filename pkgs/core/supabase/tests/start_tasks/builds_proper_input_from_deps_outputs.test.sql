begin;
select plan(3);
select pgflow_tests.reset_db();

-- SETUP: Create flow with dependencies
select pgflow.create_flow('dep_flow');
select pgflow.add_step('dep_flow', 'first');
select pgflow.add_step('dep_flow', 'second', deps => array['first']);
select pgflow.start_flow('dep_flow', '{"input": "value"}'::jsonb);

-- SETUP: Complete the first step
select array_agg(msg_id) into @first_msg_ids 
from pgflow.read_with_poll('dep_flow', 10, 5, 1, 100);

perform pgflow.start_tasks(@first_msg_ids, gen_random_uuid()) from (select 1) t;

select pgflow.complete_task(
  run_id => (select run_id from pgflow.runs where flow_slug = 'dep_flow'),
  step_slug => 'first',
  task_index => 0,
  output => '{"first_output": "completed"}'::jsonb
);

-- SETUP: Get second step message
select array_agg(msg_id) into @second_msg_ids 
from pgflow.read_with_poll('dep_flow', 10, 5, 1, 100);

-- TEST: start_tasks should return task with proper input including dependencies
select ok(
  (select input from pgflow.start_tasks(@second_msg_ids, gen_random_uuid()) where step_slug = 'second') @> '{"run": {"input": "value"}}'::jsonb,
  'Task input should include run input'
);

select ok(
  (select input from pgflow.start_tasks(@second_msg_ids, gen_random_uuid()) where step_slug = 'second') @> '{"first": {"first_output": "completed"}}'::jsonb,
  'Task input should include dependency output'
);

-- TEST: Input should be complete JSON object
select is(
  (select jsonb_typeof(input) from pgflow.start_tasks(@second_msg_ids, gen_random_uuid()) where step_slug = 'second'),
  'object',
  'Task input should be a JSON object'
);

select finish();
rollback;
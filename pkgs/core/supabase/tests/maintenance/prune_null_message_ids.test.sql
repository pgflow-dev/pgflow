begin;
select plan(6);
select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Create a flow with one step
select pgflow.create_flow('null_msg_flow', max_attempts => 0);
select pgflow.add_step('null_msg_flow', 'step1');

-- Start the flow - this creates a task with a message_id
select pgflow.start_flow('null_msg_flow', '{}'::jsonb);

-- Verify the task was created with a message_id
select is(
  (select message_id is not null from pgflow.step_tasks where flow_slug = 'null_msg_flow'),
  true,
  'Task should have a message_id after start_flow'
);

-- Manually set message_id to NULL to simulate tasks that never got queued to PGMQ
-- This can happen in edge cases or during failure scenarios
update pgflow.step_tasks
set message_id = null
where flow_slug = 'null_msg_flow';

-- Verify message_id is now NULL
select is(
  (select message_id from pgflow.step_tasks where flow_slug = 'null_msg_flow'),
  null::bigint,
  'Task message_id should be NULL after manual update'
);

-- Mark the run as failed (simulating a failure scenario)
update pgflow.runs
set
  status = 'failed',
  failed_at = now()
where flow_slug = 'null_msg_flow';

update pgflow.step_states
set
  status = 'failed',
  failed_at = now()
where flow_slug = 'null_msg_flow';

-- Age the run to make it eligible for pruning
update pgflow.runs
set
  started_at = now() - interval '31 days',
  failed_at = now() - interval '31 days'
where flow_slug = 'null_msg_flow';

update pgflow.step_states
set
  created_at = now() - interval '31 days',
  started_at = now() - interval '31 days' + interval '1 minute',
  failed_at = now() - interval '31 days' + interval '2 minutes'
where flow_slug = 'null_msg_flow';

update pgflow.step_tasks
set queued_at = now() - interval '31 days'
where flow_slug = 'null_msg_flow';

-- Verify setup before pruning
select is(
  (select count(*) from pgflow.runs where flow_slug = 'null_msg_flow'),
  1::bigint,
  'Should have 1 run before pruning'
);

select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'null_msg_flow'),
  1::bigint,
  'Should have 1 step_task before pruning'
);

-- Prune with 30-day retention
-- This should handle NULL message_id gracefully without errors
select pgflow.prune_data_older_than(make_interval(days => 30));

-- TEST: All records should be deleted despite NULL message_id
select is(
  (select count(*) from pgflow.runs where flow_slug = 'null_msg_flow'),
  0::bigint,
  'Run should be deleted even with NULL message_id in step_tasks'
);

-- TEST: step_tasks with NULL message_id should also be deleted
select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'null_msg_flow'),
  0::bigint,
  'step_tasks with NULL message_id should be deleted'
);

select finish();
rollback;

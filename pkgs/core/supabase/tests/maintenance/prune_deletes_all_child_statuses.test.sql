begin;
select plan(6);
select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Create a flow with 4 steps to test different status combinations
select pgflow.create_flow('status_test_flow', max_attempts => 0);
select pgflow.add_step('status_test_flow', 'step1');
select pgflow.add_step('status_test_flow', 'step2', ARRAY['step1']);
select pgflow.add_step('status_test_flow', 'step3', ARRAY['step2']);
select pgflow.add_step('status_test_flow', 'step4', ARRAY['step3']);

-- Start the flow to create all step_states
select pgflow.start_flow('status_test_flow', '{}'::jsonb);

-- Manually set up different statuses to test edge cases
-- step1: completed (normal case)
-- step2: started but not completed (worker crashed)
-- step3: created (never started)
-- step4: created (never started)

-- Update run to completed status with old timestamp
update pgflow.runs
set
  started_at = now() - interval '35 days',
  completed_at = now() - interval '35 days',
  status = 'completed',
  remaining_steps = 0
where flow_slug = 'status_test_flow';

-- step1: completed
update pgflow.step_states
set
  created_at = now() - interval '36 days',
  started_at = now() - interval '35 days' - interval '1 minute',
  completed_at = now() - interval '35 days',
  status = 'completed',
  remaining_tasks = 0
where flow_slug = 'status_test_flow' and step_slug = 'step1';

update pgflow.step_tasks
set
  queued_at = now() - interval '36 days',
  started_at = now() - interval '35 days' - interval '1 minute',
  completed_at = now() - interval '35 days',
  status = 'completed'
where flow_slug = 'status_test_flow' and step_slug = 'step1';

-- step2: started but not completed (simulates worker crash)
update pgflow.step_states
set
  created_at = now() - interval '36 days',
  started_at = now() - interval '35 days',
  status = 'started',
  completed_at = NULL,
  failed_at = NULL
where flow_slug = 'status_test_flow' and step_slug = 'step2';

insert into pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, status, queued_at, started_at)
select
  'status_test_flow',
  run_id,
  'step2',
  0,
  'started',
  now() - interval '36 days',
  now() - interval '35 days'
from pgflow.runs where flow_slug = 'status_test_flow';

-- step3: created but never started
update pgflow.step_states
set
  created_at = now() - interval '36 days',
  status = 'created',
  started_at = NULL,
  completed_at = NULL,
  failed_at = NULL
where flow_slug = 'status_test_flow' and step_slug = 'step3';

-- step4: created but never started
update pgflow.step_states
set
  created_at = now() - interval '36 days',
  status = 'created',
  started_at = NULL,
  completed_at = NULL,
  failed_at = NULL
where flow_slug = 'status_test_flow' and step_slug = 'step4';

-- Verify the setup before pruning
select is(
  (select count(*) from pgflow.step_states where flow_slug = 'status_test_flow' and status = 'completed'),
  1::bigint,
  'Should have 1 completed step'
);

select is(
  (select count(*) from pgflow.step_states where flow_slug = 'status_test_flow' and status = 'started'),
  1::bigint,
  'Should have 1 started step'
);

select is(
  (select count(*) from pgflow.step_states where flow_slug = 'status_test_flow' and status = 'created'),
  2::bigint,
  'Should have 2 created steps'
);

-- Prune with 30-day retention
-- All records should be deleted regardless of individual status
select pgflow.prune_data_older_than(make_interval(days => 30));

-- TEST: All runs deleted
select is(
  (select count(*) from pgflow.runs where flow_slug = 'status_test_flow'),
  0::bigint,
  'Completed run should be deleted'
);

-- TEST: All step_states deleted (completed, started, and created)
select is(
  (select count(*) from pgflow.step_states where flow_slug = 'status_test_flow'),
  0::bigint,
  'All step_states should be deleted regardless of status'
);

-- TEST: All step_tasks deleted
select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'status_test_flow'),
  0::bigint,
  'All step_tasks should be deleted regardless of status'
);

select finish();
rollback;
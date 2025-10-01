begin;
select plan(7);
select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Create a flow with 3 sequential steps
select pgflow.create_flow('multi_step_flow', max_attempts => 0);
select pgflow.add_step('multi_step_flow', 'step1');
select pgflow.add_step('multi_step_flow', 'step2', ARRAY['step1']);
select pgflow.add_step('multi_step_flow', 'step3', ARRAY['step2']);

-- Start the flow and fail step1
-- This causes the run to fail, leaving step2 and step3 unexecuted
select pgflow.start_flow('multi_step_flow', '{}'::jsonb);
select pgflow_tests.poll_and_fail('multi_step_flow');

-- Verify setup: Run failed, step1 failed, step2 and step3 never executed
select is(
  (select status from pgflow.runs where flow_slug = 'multi_step_flow'),
  'failed',
  'Run should be marked as failed'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'multi_step_flow' and step_slug = 'step1'),
  'failed',
  'step1 should be failed'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'multi_step_flow' and step_slug = 'step2'),
  'created',
  'step2 should remain in created status (unexecuted)'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'multi_step_flow' and step_slug = 'step3'),
  'created',
  'step3 should remain in created status (unexecuted)'
);

-- Age the failed run to make it old
update pgflow.runs
set
  started_at = now() - interval '31 days',
  failed_at = now() - interval '31 days',
  status = 'failed'
where flow_slug = 'multi_step_flow';

update pgflow.step_states
set
  created_at = now() - interval '31 days',
  started_at = now() - interval '31 days' + interval '1 minute',
  failed_at = now() - interval '31 days' + interval '2 minutes',
  status = 'failed'
where flow_slug = 'multi_step_flow' and step_slug = 'step1';

update pgflow.step_tasks
set
  queued_at = now() - interval '31 days',
  started_at = now() - interval '31 days' + interval '1 minute',
  failed_at = now() - interval '31 days' + interval '2 minutes',
  status = 'failed'
where flow_slug = 'multi_step_flow' and step_slug = 'step1';

-- Prune old records with 30-day retention
-- This should delete ALL records for the failed run, including unexecuted steps
select pgflow.prune_data_older_than(make_interval(days => 30));

-- TEST: All runs should be deleted
select is(
  (select count(*) from pgflow.runs where flow_slug = 'multi_step_flow'),
  0::bigint,
  'Failed run should be deleted'
);

-- TEST: All step_states should be deleted (including unexecuted ones)
select is(
  (select count(*) from pgflow.step_states where flow_slug = 'multi_step_flow'),
  0::bigint,
  'All step_states should be deleted, including unexecuted steps'
);

-- TEST: All step_tasks should be deleted
select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'multi_step_flow'),
  0::bigint,
  'All step_tasks should be deleted'
);

select finish();
rollback;
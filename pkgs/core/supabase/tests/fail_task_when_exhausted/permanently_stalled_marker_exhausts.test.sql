-- Test: a non-null permanently_stalled_at makes a nonterminal task exhausted
-- inside fail_task(), regardless of its effective max_attempts (#689 ADR:
-- permanently stalled tasks exhaust recovery without rewriting claim counts).
-- Ordinary failure callbacks must exhaust a marked task rather than requeue it
-- against its archived message.
begin;
select plan(6);

select pgflow_tests.reset_db();

-- Marked started task with attempts left: fail_task must exhaust, not retry
select pgflow.create_flow('fail_flow', max_attempts => 3);
select pgflow.add_step('fail_flow', 'step_a');
select pgflow.start_flow('fail_flow', '{}'::jsonb);

select pgflow_tests.ensure_worker('fail_flow');
select pgflow_tests.read_and_start('fail_flow', 30, 1);

update pgflow.step_tasks
set permanently_stalled_at = now(), attempts_count = 1
where flow_slug = 'fail_flow';

select pgflow.fail_task(
  (select run_id from pgflow.runs where flow_slug = 'fail_flow'),
  'step_a',
  0,
  'handler error'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'fail_flow'),
  'failed',
  'marked task exhausts even with attempts_count below max_attempts'
);

select is(
  (select attempts_count from pgflow.step_tasks where flow_slug = 'fail_flow'),
  1,
  'attempts_count is preserved as committed task claims'
);

select is(
  (select status from pgflow.runs where flow_slug = 'fail_flow'),
  'failed',
  'marked task failure applies when_exhausted=fail to the run'
);

-- Marked queued leftover (requeued by an older callback against an archived
-- message): fail_task must terminalize it, not leave it queued
select pgflow.create_flow('leftover_flow', max_attempts => 3);
select pgflow.add_step('leftover_flow', 'step_a');
select pgflow.start_flow('leftover_flow', '{}'::jsonb);

select pgflow_tests.ensure_worker('leftover_flow');
select pgflow_tests.read_and_start('leftover_flow', 30, 1);

update pgflow.step_tasks
set
  permanently_stalled_at = now(),
  status = 'queued',
  started_at = null,
  attempts_count = 1
where flow_slug = 'leftover_flow';

select pgflow.fail_task(
  (select run_id from pgflow.runs where flow_slug = 'leftover_flow'),
  'step_a',
  0,
  'late handler error'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'leftover_flow'),
  'failed',
  'marked queued leftover terminalizes instead of staying queued'
);

select is(
  (select status from pgflow.runs where flow_slug = 'leftover_flow'),
  'failed',
  'marked queued leftover fails its run'
);

select is(
  (select error_message from pgflow.step_tasks where flow_slug = 'leftover_flow'),
  'late handler error',
  'callback error message is preserved'
);

select finish();
rollback;

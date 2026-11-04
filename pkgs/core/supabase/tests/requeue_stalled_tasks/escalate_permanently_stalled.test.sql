-- Test: escalate_permanently_stalled() terminalizes stamped tasks through
-- the step's when_exhausted policy (#689). requeue_stalled_tasks() archives
-- and stamps them; escalation is a separate call that hands each task to
-- fail_task() so the existing exhaustion policy owns every transition.
begin;
select plan(41);

select pgflow_tests.reset_db();

--------------------------------------------------------------------------------
-- Failure mode: single-step flow terminalizes to failed run
--------------------------------------------------------------------------------
select pgflow.create_flow('fail_flow', timeout => 5);
select pgflow.add_step('fail_flow', 'step_a');
select pgflow.start_flow('fail_flow', '{"input": "test"}'::jsonb);

select pgflow_tests.ensure_worker('fail_flow');
select pgflow_tests.read_and_start('fail_flow', 30, 1);

-- Stall the fourth claim past the requeue cap
update pgflow.step_tasks
set
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds',
  requeued_count = 3
where flow_slug = 'fail_flow';

select is(
  pgflow.requeue_stalled_tasks(),
  0,
  'requeue past the cap returns 0 (archive and stamp, no requeue)'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'fail_flow'),
  'started',
  'task remains started after stamping; escalation is a separate step'
);

select is(
  pgflow.escalate_permanently_stalled(),
  1,
  'escalate terminalizes the permanently stalled task'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'fail_flow'),
  'failed',
  'escalated task becomes failed'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'fail_flow'),
  'failed',
  'step becomes failed through when_exhausted default'
);

select is(
  (select status from pgflow.runs where flow_slug = 'fail_flow'),
  'failed',
  'run becomes failed'
);

select ok(
  (select permanently_stalled_at from pgflow.step_tasks where flow_slug = 'fail_flow') is not null,
  'permanently_stalled_at is retained for investigation'
);

select is(
  (select error_message from pgflow.step_tasks where flow_slug = 'fail_flow'),
  'permanently stalled: worker did not report after 3 requeues',
  'escalation records the permanently stalled error message'
);

select is(
  (select requeued_count from pgflow.step_tasks where flow_slug = 'fail_flow'),
  3,
  'escalation preserves the recovery count'
);

select is(
  (select count(*) from pgmq.q_fail_flow),
  0::bigint,
  'escalated message is absent from its active queue'
);

select is(
  (select count(*) from pgmq.a_fail_flow),
  1::bigint,
  'escalated message remains in the archive'
);

select is(
  pgflow_tests.count_realtime_events(
    'step:failed',
    (select run_id from pgflow.runs where flow_slug = 'fail_flow'),
    'step_a'
  ),
  1,
  'escalation emits one step failure event'
);

select is(
  pgflow_tests.count_realtime_events(
    'run:failed',
    (select run_id from pgflow.runs where flow_slug = 'fail_flow')
  ),
  1,
  'escalation emits one run failure event'
);


--------------------------------------------------------------------------------
-- Skip mode: skipped step starts its dependent
--------------------------------------------------------------------------------
select pgflow.create_flow('skip_flow', timeout => 5);
select pgflow.add_step('skip_flow', 'process', when_exhausted => 'skip');
select pgflow.add_step('skip_flow', 'finalize', array['process']);
select pgflow.start_flow('skip_flow', '{}'::jsonb);

select pgflow_tests.ensure_worker('skip_flow');
select pgflow_tests.read_and_start('skip_flow', 30, 1);

update pgflow.step_tasks
set
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds',
  requeued_count = 3
where flow_slug = 'skip_flow';

select is(
  (select pgflow.requeue_stalled_tasks() + pgflow.escalate_permanently_stalled()),
  1,
  'skip flow escalates one stalled task'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'skip_flow' and step_slug = 'process'),
  'skipped',
  'skip mode skips the stalled step instead of failing the run'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'skip_flow' and step_slug = 'finalize'),
  'started',
  'dependent step starts after the skipped step'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'skip_flow' and step_slug = 'finalize'),
  'queued',
  'dependent step has a queued task'
);

select is(
  (select status from pgflow.runs where flow_slug = 'skip_flow'),
  'started',
  'run continues after the skipped step'
);

--------------------------------------------------------------------------------
-- Skip-cascade mode: dependents are skipped and the run completes
--------------------------------------------------------------------------------
select pgflow.create_flow('cascade_flow', timeout => 5);
select pgflow.add_step('cascade_flow', 'process', when_exhausted => 'skip-cascade');
select pgflow.add_step('cascade_flow', 'dependent', array['process']);
select pgflow.start_flow('cascade_flow', '{}'::jsonb);

select pgflow_tests.ensure_worker('cascade_flow');
select pgflow_tests.read_and_start('cascade_flow', 30, 1);

update pgflow.step_tasks
set
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds',
  requeued_count = 3
where flow_slug = 'cascade_flow';

select is(
  (select pgflow.requeue_stalled_tasks() + pgflow.escalate_permanently_stalled()),
  1,
  'cascade flow escalates one stalled task'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'cascade_flow' and step_slug = 'dependent'),
  'skipped',
  'skip-cascade skips the dependent step'
);

select is(
  (select status from pgflow.runs where flow_slug = 'cascade_flow'),
  'completed',
  'run completes after the cascade skip'
);

--------------------------------------------------------------------------------
-- Map step: stalled task fails, active siblings are skipped
--------------------------------------------------------------------------------
select pgflow.create_flow('map_flow', timeout => 5);
select pgflow.add_step('map_flow', 'items', step_type => 'map', when_exhausted => 'skip');
select pgflow.start_flow('map_flow', '[10, 20, 30]'::jsonb);

select pgflow_tests.ensure_worker('map_flow');
select pgflow_tests.read_and_start('map_flow', 30, 1);

update pgflow.step_tasks
set
  queued_at = now() - interval '40 seconds',
  started_at = now() - interval '36 seconds',
  requeued_count = 3
where flow_slug = 'map_flow' and task_index = 0;

select is(
  (select pgflow.requeue_stalled_tasks() + pgflow.escalate_permanently_stalled()),
  1,
  'map flow escalates one stalled task'
);

select results_eq(
  $$ select status from pgflow.step_tasks
     where flow_slug = 'map_flow' order by task_index $$,
  $$ values ('failed'), ('skipped'), ('skipped') $$,
  'stalled map task fails while queued siblings are skipped'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'map_flow'),
  'skipped',
  'map step is skipped'
);

select is(
  (select status from pgflow.runs where flow_slug = 'map_flow'),
  'completed',
  'run completes after the map step skip'
);

--------------------------------------------------------------------------------
-- Previously stamped rows: rows stamped by earlier deployments escalate too
--------------------------------------------------------------------------------
select pgflow.create_flow('stale_flow', timeout => 5);
select pgflow.add_step('stale_flow', 'step_a');
select pgflow.start_flow('stale_flow', '{}'::jsonb);

select pgflow_tests.ensure_worker('stale_flow');
select pgflow_tests.read_and_start('stale_flow', 30, 1);

-- Simulate a row stamped by an earlier deployment without requeued_count = 3
update pgflow.step_tasks
set permanently_stalled_at = now() - interval '1 hour'
where flow_slug = 'stale_flow';

select is(
  pgflow.escalate_permanently_stalled(),
  1,
  'previously stamped row escalates without another requeue sweep'
);

select is(
  (select status from pgflow.runs where flow_slug = 'stale_flow'),
  'failed',
  'previously stamped row fails its run'
);

select is(
  pgflow.escalate_permanently_stalled(),
  0,
  'escalate is safe to repeat after catching up old rows'
);

--------------------------------------------------------------------------------
-- Marked queued leftovers: requeued by older callbacks, escalated here
--------------------------------------------------------------------------------
select pgflow.create_flow('leftover_flow', timeout => 5);
select pgflow.add_step('leftover_flow', 'step_a');
select pgflow.start_flow('leftover_flow', '{}'::jsonb);

select pgflow_tests.ensure_worker('leftover_flow');
select pgflow_tests.read_and_start('leftover_flow', 30, 1);

-- Simulate an older callback that requeued the marked task against its
-- archived message
update pgflow.step_tasks
set
  permanently_stalled_at = now() - interval '1 hour',
  status = 'queued',
  started_at = null
where flow_slug = 'leftover_flow';

select is(
  pgflow.escalate_permanently_stalled(),
  1,
  'marked queued leftover escalates'
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

--------------------------------------------------------------------------------
-- Completion that wins before escalation remains completed
--------------------------------------------------------------------------------
select pgflow.create_flow('late_flow', timeout => 5);
select pgflow.add_step('late_flow', 'step_a');
select pgflow.start_flow('late_flow', '{}'::jsonb);

select pgflow_tests.ensure_worker('late_flow');
select pgflow_tests.read_and_start('late_flow', 30, 1);

update pgflow.step_tasks
set permanently_stalled_at = now()
where flow_slug = 'late_flow';

select pgflow.complete_task(
  (select run_id from pgflow.runs where flow_slug = 'late_flow'),
  'step_a',
  0,
  '{"result": "late but valid"}'::jsonb
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'late_flow'),
  'completed',
  'completion that wins before escalation remains completed'
);

select is(
  (select status from pgflow.runs where flow_slug = 'late_flow'),
  'completed',
  'winning completion completes the run'
);

select is(
  pgflow.escalate_permanently_stalled(),
  0,
  'escalation skips the completed task'
);

select pgflow.fail_task(
  (select run_id from pgflow.runs where flow_slug = 'late_flow'),
  'step_a',
  0,
  'late callback after escalation'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'late_flow'),
  'completed',
  'late failure callback leaves the completed task unchanged'
);

select is(
  (select remaining_steps from pgflow.runs where flow_slug = 'late_flow'),
  0,
  'late failure callback does not decrement a completed run again'
);

select is(
  pgflow_tests.count_realtime_events(
    'run:completed',
    (select run_id from pgflow.runs where flow_slug = 'late_flow')
  ),
  1,
  'late failure callback does not duplicate terminal events'
);

--------------------------------------------------------------------------------
-- Late callback after escalation leaves the failed run unchanged
--------------------------------------------------------------------------------
select pgflow.create_flow('late_callback_flow', timeout => 5);
select pgflow.add_step('late_callback_flow', 'step_a');
select pgflow.start_flow('late_callback_flow', '{}'::jsonb);

select pgflow_tests.ensure_worker('late_callback_flow');
select pgflow_tests.read_and_start('late_callback_flow', 30, 1);

update pgflow.step_tasks
set permanently_stalled_at = now()
where flow_slug = 'late_callback_flow';

select is(
  pgflow.escalate_permanently_stalled(),
  1,
  'late-callback scenario escalates its stalled task'
);

select pgflow.fail_task(
  (select run_id from pgflow.runs where flow_slug = 'late_callback_flow'),
  'step_a',
  0,
  'late callback after escalation'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'late_callback_flow'),
  'failed',
  'late failure callback leaves the escalated task unchanged'
);

select is(
  (select error_message from pgflow.step_tasks where flow_slug = 'late_callback_flow'),
  'permanently stalled: worker did not report after 0 requeues',
  'late callback does not replace escalation diagnostics'
);

select is(
  pgflow_tests.count_realtime_events(
    'run:failed',
    (select run_id from pgflow.runs where flow_slug = 'late_callback_flow')
  ),
  1,
  'late callback does not duplicate the run failure event'
);

select finish();
rollback;

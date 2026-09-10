-- Recovery keeps queue snapshots and margins (#650): requeue visibility uses
-- the task snapshot, permanent stall archives without revival, and terminal
-- parents are excluded. The +30s recovery margin is distinct from the +2s
-- claim margin.
begin;
select plan(9);
select pgflow_tests.reset_db();

-- ============================================================
-- Requeue: snapshot-based visibility reset, unchanged queue_name
-- ============================================================
select pgflow.create_flow('RecoverMe', timeout => 1);
select pgflow.add_step('RecoverMe', 'first');
select pgflow.start_flow('RecoverMe', '{}');
select pgflow_tests.ensure_worker('recoverme');

-- Direct test-only started-task setup (recovery, not claiming, is under test)
update pgflow.step_tasks
set queued_at = now() - interval '120 seconds',
    started_at = now() - interval '120 seconds',
    status = 'started',
    attempts_count = attempts_count + 1,
    last_worker_id = '11111111-1111-1111-1111-111111111111'::uuid
where flow_slug = 'RecoverMe';

select is(
  (select pgflow.requeue_stalled_tasks()),
  1,
  'one stalled task is requeued'
);
select is(
  (select status from pgflow.step_tasks where flow_slug = 'RecoverMe'),
  'queued',
  'requeued task returns to queued'
);
select is(
  (select queue_name from pgflow.step_tasks where flow_slug = 'RecoverMe'),
  'recoverme',
  'requeue leaves the queue snapshot unchanged'
);
select ok(
  (select vt <= clock_timestamp() from pgmq.q_recoverme),
  'requeued message is visible immediately in its snapshot queue'
);
select is(
  (select requeued_count from pgflow.step_tasks where flow_slug = 'RecoverMe'),
  1,
  'requeue increments the counter once'
);

-- ============================================================
-- Permanent stall: stays started, never reanimated
-- ============================================================
select pgflow_tests.reset_db();
select pgflow.create_flow('Permanent', timeout => 1);
select pgflow.add_step('Permanent', 'first');
select pgflow.start_flow('Permanent', '{}');
select pgflow_tests.ensure_worker('permanent');
update pgflow.step_tasks
set queued_at = now() - interval '120 seconds',
    started_at = now() - interval '120 seconds',
    status = 'started',
    attempts_count = attempts_count + 1,
    last_worker_id = '11111111-1111-1111-1111-111111111111'::uuid,
    requeued_count = 3
where flow_slug = 'Permanent';

select is(
  (select pgflow.requeue_stalled_tasks()),
  0,
  'permanently stalled task is not requeued'
);
select is(
  (select status from pgflow.step_tasks where flow_slug = 'Permanent'),
  'started',
  'permanent stall stays started'
);
select ok(
  (select permanently_stalled_at is not null from pgflow.step_tasks where flow_slug = 'Permanent'),
  'permanent stall is timestamped'
);
select is(
  (select count(*)::int from pgmq.a_permanent),
  1,
  'permanent stall archives its message from the snapshot queue'
);

select finish();
rollback;

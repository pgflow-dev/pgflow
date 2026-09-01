-- Test: requeue_stalled_tasks uses the effective step timeout
-- Effective timeout: coalesce(step.opt_timeout, flow.opt_timeout)
-- Stalled when started_at is strictly older than effective timeout + 30s buffer
begin;
select plan(10);

select pgflow_tests.reset_db();

-- ==========================================
-- Case 1: step timeout 5 overrides flow timeout 60
-- ==========================================
select pgflow.create_flow('step_short', null, null, 60);
select pgflow.add_step('step_short', 'step_a', timeout => 5);

select pgflow.start_flow('step_short', '"x"'::jsonb);
select pgflow_tests.ensure_worker('step_short');
select pgflow_tests.read_and_start('step_short', 30, 1);

-- Exactly 35s old: boundary of 5s + 30s buffer, not strictly older
update pgflow.step_tasks
set queued_at = now() - interval '39 seconds',
    started_at = now() - interval '35 seconds'
where flow_slug = 'step_short';

select is(
  pgflow.requeue_stalled_tasks(),
  0,
  'step 5 / flow 60: exactly 35s old is not requeued (strict boundary)'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'step_short'),
  'started',
  'step 5 / flow 60: boundary task stays started'
);

-- 36s old: strictly past effective timeout 5s + 30s buffer
update pgflow.step_tasks
set queued_at = now() - interval '40 seconds',
    started_at = now() - interval '36 seconds'
where flow_slug = 'step_short';

select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'step 5 / flow 60: 36s old requeued per effective step timeout'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'step_short'),
  'queued',
  'step 5 / flow 60: 36s old task becomes queued'
);

-- ==========================================
-- Case 2: step timeout 60 overrides flow timeout 5
-- ==========================================
select pgflow.create_flow('step_long', null, null, 5);
select pgflow.add_step('step_long', 'step_a', timeout => 60);

select pgflow.start_flow('step_long', '"x"'::jsonb);
select pgflow_tests.ensure_worker('step_long');
select pgflow_tests.read_and_start('step_long', 30, 1);

-- 36s old: past flow timeout 5s + 30s buffer, but effective timeout is 60s
update pgflow.step_tasks
set queued_at = now() - interval '40 seconds',
    started_at = now() - interval '36 seconds'
where flow_slug = 'step_long';

select is(
  pgflow.requeue_stalled_tasks(),
  0,
  'step 60 / flow 5: 36s old not requeued despite flow timeout 5s'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'step_long'),
  'started',
  'step 60 / flow 5: 36s old task stays started'
);

-- 91s old: strictly past effective timeout 60s + 30s buffer
update pgflow.step_tasks
set queued_at = now() - interval '95 seconds',
    started_at = now() - interval '91 seconds'
where flow_slug = 'step_long';

select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'step 60 / flow 5: 91s old requeued per effective step timeout'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'step_long'),
  'queued',
  'step 60 / flow 5: 91s old task becomes queued'
);

-- ==========================================
-- Case 3: null step timeout inherits flow timeout 5
-- ==========================================
select pgflow.create_flow('step_null', null, null, 5);
select pgflow.add_step('step_null', 'step_a');

select pgflow.start_flow('step_null', '"x"'::jsonb);
select pgflow_tests.ensure_worker('step_null');
select pgflow_tests.read_and_start('step_null', 30, 1);

-- 36s old: effective timeout is inherited flow timeout 5s + 30s buffer
update pgflow.step_tasks
set queued_at = now() - interval '40 seconds',
    started_at = now() - interval '36 seconds'
where flow_slug = 'step_null';

select is(
  pgflow.requeue_stalled_tasks(),
  1,
  'null step timeout inherits flow 5: 36s old requeued'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'step_null'),
  'queued',
  'null step timeout inherits flow 5: 36s old task becomes queued'
);

select finish();
rollback;

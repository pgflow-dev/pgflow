-- Queue identity snapshots (#650): lifecycle transitions (claim, retry,
-- recovery, completion, downstream dispatch, late callback) never rewrite the
-- stored queue name, and every message operation runs through it.
begin;
select plan(9);

select pgflow_tests.reset_db();

select pgflow.create_flow('stableq', null, null, 5);
select pgflow.add_step('stableq', 'a', max_attempts => 2);
select pgflow.add_step('stableq', 'b', ARRAY['a']);
select pgflow.start_flow('stableq', '"x"'::jsonb);
select pgflow_tests.ensure_worker('stableq');

-- 1) Claim through the stored queue identity
select pgflow_tests.read_and_start('stableq');

select is(
  (select queue_name from pgflow.step_tasks where step_slug = 'a'),
  'stableq',
  'claim keeps the stored queue snapshot'
);

-- 2) Failure with retries left: message visibility set through stored queue
select pgflow.fail_task(
  (select run_id from pgflow.runs where flow_slug = 'stableq'),
  'a',
  0,
  'boom'
);

select is(
  (select status from pgflow.step_tasks where step_slug = 'a'),
  'queued',
  'task requeued after failure'
);

select is(
  (select count(*) from pgmq.q_stableq q
    join pgflow.step_tasks st on st.queue_name = 'stableq' and st.message_id = q.msg_id),
  1::bigint,
  'retry delay applied through the stored queue'
);

-- 3) Stalled recovery requeues through the stored queue
select pgflow_tests.reset_message_visibility('stableq');
select pgflow_tests.read_and_start('stableq');
update pgflow.step_tasks
set queued_at = now() - interval '120 seconds',
    started_at = now() - interval '119 seconds'
where step_slug = 'a';

select pgflow.requeue_stalled_tasks();

select is(
  (select status from pgflow.step_tasks where step_slug = 'a'),
  'queued',
  'stalled task requeued by recovery'
);

select is(
  (select queue_name from pgflow.step_tasks where step_slug = 'a'),
  'stableq',
  'recovery keeps the stored queue snapshot'
);

-- 4) Complete the recovered task: dependent step dispatches through the route
select pgflow_tests.reset_message_visibility('stableq');
select pgflow_tests.read_and_start('stableq');
select pgflow.complete_task(
  (select run_id from pgflow.runs where flow_slug = 'stableq'),
  'a',
  0,
  null
);

select is(
  (select count(*) from pgflow.step_tasks where queue_name = 'stableq'),
  2::bigint,
  'completion and downstream dispatch keep the stored queue snapshot'
);

-- 5) Finish the run
select pgflow_tests.reset_message_visibility('stableq');
select pgflow_tests.read_and_start('stableq');
select pgflow.complete_task(
  (select run_id from pgflow.runs where flow_slug = 'stableq'),
  'b',
  0,
  null
);

select is(
  (select status from pgflow.runs where flow_slug = 'stableq'),
  'completed',
  'run completed'
);

-- 6) Late callback on the terminal task: guarded, snapshot untouched
select pgflow.complete_task(
  (select run_id from pgflow.runs where flow_slug = 'stableq'),
  'a',
  0,
  null
);

select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'stableq' and queue_name <> 'stableq'),
  0::bigint,
  'no lifecycle path ever rewrote a task queue snapshot'
);

select is(
  (select count(*) from pgmq.a_stableq),
  2::bigint,
  'both messages archived through the stored queue'
);

select finish();
rollback;

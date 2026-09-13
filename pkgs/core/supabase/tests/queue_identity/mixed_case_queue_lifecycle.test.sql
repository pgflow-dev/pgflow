-- Queues created by older pgflow releases keep their original mixed-case
-- spelling in pgmq (#650). Every message operation resolves the stored
-- canonical name through pgmq.list_queues() instead of creating a second
-- metadata entry: dispatch, claim, visibility, completion, retry, recovery.
begin;
select plan(12);

select pgflow_tests.reset_db();

-- Simulate an upgraded 0.16.0 flow: canonical name stored, physical queue
-- still listed under the original spelling
select pgflow.create_flow('LegacyCase', null, null, 5);
select pgflow.add_step('LegacyCase', 'a', max_attempts => 2);
select pgmq.drop_queue('legacycase');
select pgmq.create('LegacyCase');

select pgflow.start_flow('LegacyCase', '"x"'::jsonb);

select is(
  (select queue_name from pgflow.step_tasks where flow_slug = 'LegacyCase'),
  'legacycase',
  'task stores the canonical lowercase name'
);

select is(
  (select count(*) from pgmq.q_LegacyCase),
  1::bigint,
  'dispatch resolved the original spelling for the send'
);

select is(
  (select count(*) from pgmq.list_queues() where lower(queue_name) = 'legacycase'),
  1::bigint,
  'no second metadata entry was created'
);

-- Claim through the actual polled queue ('LegacyCase')
select pgflow_tests.ensure_worker('legacycase');
select pgflow_tests.ensure_worker('LegacyCase');

with msgs as (
  select array_agg(msg_id) as ids from pgmq.read_with_poll('LegacyCase', 30, 5, 1, 50)
)
select is(
  (select count(*) from pgflow.start_tasks(
    'LegacyCase',
    (select ids from msgs),
    '11111111-1111-1111-1111-111111111111'::uuid,
    'LegacyCase'
  ))::int,
  1,
  'claim through the polled original spelling claims the task'
);

-- Visibility was extended on the physical queue table
select ok(
  (select extract(epoch from (q.vt - clock_timestamp()))::int >= 5
   from pgmq.q_LegacyCase q
   join pgflow.step_tasks st on st.message_id = q.msg_id),
  'claim visibility extension reached the physical queue'
);

-- Failure with retries left: retry delay set on the physical queue
select pgflow.fail_task(
  (select run_id from pgflow.runs where flow_slug = 'LegacyCase'),
  'a',
  0,
  'boom'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'LegacyCase'),
  'queued',
  'task requeued after failure'
);

select ok(
  (select extract(epoch from (q.vt - clock_timestamp()))::int > 0
   from pgmq.q_LegacyCase q
   join pgflow.step_tasks st on st.message_id = q.msg_id),
  'retry visibility delay applied on the physical queue'
);

-- Stalled recovery requeues through the stored queue
-- Re-claim the requeued task so recovery sees a started task
select pgflow_tests.reset_message_visibility('LegacyCase');
select pgflow_tests.read_and_start('LegacyCase');

update pgflow.step_tasks
set queued_at = now() - interval '120 seconds',
    started_at = now() - interval '119 seconds'
where flow_slug = 'LegacyCase';

select pgflow.requeue_stalled_tasks();

select is(
  (select status from pgflow.step_tasks where flow_slug = 'LegacyCase'),
  'queued',
  'recovery requeued the stalled task'
);

select ok(
  (select q.vt <= clock_timestamp()
   from pgmq.q_LegacyCase q
   join pgflow.step_tasks st on st.message_id = q.msg_id),
  'recovery made the message immediately visible on the physical queue'
);

-- Re-claim and complete: message archived into the physical archive table
select pgflow_tests.ensure_worker('LegacyCase');
select pgflow_tests.read_and_start('LegacyCase');

select pgflow.complete_task(
  (select run_id from pgflow.runs where flow_slug = 'LegacyCase'),
  'a',
  0,
  null
);

select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'LegacyCase' and status = 'completed')::int,
  1,
  'task completed through the stored queue'
);

select is(
  (select count(*) from pgmq.a_LegacyCase),
  1::bigint,
  'completion archived the message on the physical archive table'
);

select is(
  (select count(*) from pgmq.q_LegacyCase),
  0::bigint,
  'physical queue is empty after archival'
);

select finish();
rollback;

-- Message hot paths (#650 review correction): dispatch, claim, visibility,
-- completion, retry, and stalled recovery address queues by the stored
-- canonical name and never consult the pgmq queue listing. PGMQ's public
-- message API normalizes names itself, so no hot-path resolution is needed.
-- pgmq.list_queues() is shadowed with a function that raises: any hot-path
-- call to the listing fails the test. Provisioning and deletion (which do
-- need the listing) run before the trap is armed.
begin;
select plan(6);

select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');
select pgflow.start_flow('sequential', '"x"'::jsonb);

-- Arm the trap: any message-path call to the queue listing raises
create or replace function pgmq.list_queues()
returns setof pgmq.queue_record
language plpgsql
as $$
begin
  raise exception 'message hot path called pgmq.list_queues()';
end;
$$;

-- Claim: read_with_poll + start_tasks visibility extension (set_vt_batch)
select pgflow_tests.read_and_start('sequential');

select is(
  (select status from pgflow.step_tasks where step_slug = 'first'),
  'started',
  'claim and visibility extension ran without the queue listing'
);

-- Retry: fail_task with retries left applies the delay through pgmq.set_vt
select pgflow.fail_task(
  (select run_id from pgflow.runs where flow_slug = 'sequential'),
  'first',
  0,
  'boom'
);

select is(
  (select status from pgflow.step_tasks where step_slug = 'first'),
  'queued',
  'retry visibility delay ran without the queue listing'
);

-- Recovery: requeue_stalled_tasks resets visibility through set_vt_batch
select pgflow_tests.reset_message_visibility('sequential');
select pgflow_tests.read_and_start('sequential');

update pgflow.step_tasks
set queued_at = now() - interval '120 seconds',
    started_at = now() - interval '119 seconds'
where step_slug = 'first';

select is(
  pgflow.requeue_stalled_tasks()::int,
  1,
  'stalled recovery requeued without the queue listing'
);

-- Completion archives the message and dispatches the next step (send_batch)
select pgflow_tests.reset_message_visibility('sequential');
select pgflow_tests.read_and_start('sequential');

select pgflow.complete_task(
  (select run_id from pgflow.runs where flow_slug = 'sequential'),
  'first',
  0,
  null
);

select is(
  (select status from pgflow.step_tasks where step_slug = 'first'),
  'completed',
  'completion archived the message without the queue listing'
);

select is(
  (select count(*) from pgflow.step_tasks where step_slug = 'second' and status = 'queued')::int,
  1,
  'next-step dispatch ran without the queue listing'
);

select is(
  (select count(*) from pgmq.a_sequential)::int,
  1,
  'message reached the physical archive table without the queue listing'
);

select finish();
rollback;

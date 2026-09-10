-- Fatal batch atomicity (#650): with any fatal member, claim none, mutate no
-- task history, archive nothing; commit the complete-batch visibility reset
-- and the persistent HTTP restart pause, and return a normal fatal result.
begin;
select plan(9);
select pgflow_tests.reset_db();

select pgflow.create_flow('Orders', max_attempts => 3);
select pgflow.add_step('Orders', 'first');
select pgflow.start_flow('Orders', '{}');

select pgflow.track_worker_function('orders_worker');
select pgflow_tests.ensure_worker('orders', function_name => 'orders_worker');

-- Capture pre-claim state
create temporary table before_claim as
select status, attempts_count, started_at from pgflow.step_tasks;

-- The batch: the valid queued task's message plus unsupported identity work
select message_id as msg_id from pgflow.step_tasks \gset
select pgmq.send('orders', '{"flow_slug":"Orders","run_id":"not-a-uuid"}');
select pgflow_tests.reset_message_visibility('orders');

create temporary table claim_ids as
select array_agg(msg_id order by msg_id) as ids from pgmq.q_orders;

create temporary table claim_result as
select pgflow.claim_tasks(
  'orders', 'Orders',
  (select ids from claim_ids),
  '11111111-1111-1111-1111-111111111111'::uuid
) as result;

select is(
  (select result->>'status' from claim_result),
  'fatal',
  'unsupported identity is fatal'
);
select is(
  (select jsonb_array_length(result->'tasks') from claim_result),
  0,
  'fatal claims no tasks'
);
select is(
  (select result->'errors'->0->>'reason' from claim_result),
  'unsupported_work',
  'the fatal diagnostic names the reason'
);
select ok(
  (select result::text from claim_result) not like '%not-a-uuid%',
  'the fatal diagnostic carries no envelope body'
);
select results_eq(
  $$ select status, attempts_count from pgflow.step_tasks $$,
  $$ select status, attempts_count from before_claim $$,
  'no task history changes on a fatal batch'
);
select is(
  (select count(*)::int from pgmq.a_orders),
  0,
  'nothing is archived on a fatal batch'
);
select is(
  (select enabled from pgflow.worker_functions where function_name = 'orders_worker'),
  false,
  'fatal claim persists HTTP restart pause'
);
select ok(
  (select bool_and(vt <= clock_timestamp()) from pgmq.q_orders),
  'every member of the read batch is reset to immediate visibility'
);
select is(
  (select count(*)::int from pgflow.runs where status = 'started'),
  1,
  'the run is untouched by the fatal claim'
);

select finish();
rollback;

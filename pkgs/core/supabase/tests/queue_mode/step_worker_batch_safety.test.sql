-- Step-worker batch safety (#651): a step worker claims only its exact route,
-- leaves unmatched or wrong-route messages visible again, and never increments
-- an already-started task a second time.
begin;
select plan(8);

select pgflow_tests.reset_db();

select pgflow.ensure_flow_compiled(
  'batchSafety',
  '{
    "steps": [
      {"slug": "first", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "second", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'step'
);
select pgflow.start_flow('batchSafety', '"x"'::jsonb);

-- One valid task message plus two messages that cannot be claimed by the
-- first-step worker. The second wrong-route message has an id that belongs to
-- the second step task, proving queue and selector both constrain a batch.
select message_id as valid_id
from pgflow.step_tasks
where flow_slug = 'batchSafety' and step_slug = 'first' \gset
select pgmq.send('batchsafety__first', '{"unmatched": true}'::jsonb) as unmatched_id \gset
select pgmq.send('batchsafety__first', '{"wrongRoute": true}'::jsonb) as wrong_route_id \gset
update pgflow.step_tasks
set message_id = :'wrong_route_id'::bigint
where flow_slug = 'batchSafety' and step_slug = 'second';

select array_agg(msg_id order by msg_id) as batch_ids
from pgmq.read_with_poll('batchsafety__first', 1, 3, 1, 10) \gset
select is(
  cardinality(:'batch_ids'::bigint[]),
  3,
  'the step-worker batch contains valid, unmatched, and wrong-route messages'
);

select pgflow_tests.ensure_worker('batchsafety__first');
select is(
  (
    select count(*)
    from pgflow.start_tasks(
      flow_slug => 'batchSafety',
      msg_ids => :'batch_ids'::bigint[],
      worker_id => '11111111-1111-1111-1111-111111111111'::uuid,
      queue_name => 'batchsafety__first',
      step_slug => 'first'
    )
  ),
  1::bigint,
  'the mixed batch claims only the valid first-step task'
);

select is(
  (
    select status || ':' || attempts_count::text
    from pgflow.step_tasks
    where message_id = :'valid_id'::bigint and queue_name = 'batchsafety__first'
  ),
  'started:1',
  'the valid task starts with one attempt'
);
select is(
  (
    select status || ':' || attempts_count::text
    from pgflow.step_tasks
    where flow_slug = 'batchSafety' and step_slug = 'second'
  ),
  'queued:0',
  'the wrong-route task remains queued without an attempt'
);

select is(
  (
    select count(*)
    from pgflow.start_tasks(
      flow_slug => 'batchSafety',
      msg_ids => array[:'valid_id'::bigint],
      worker_id => '11111111-1111-1111-1111-111111111111'::uuid,
      queue_name => 'batchsafety__first',
      step_slug => 'first'
    )
  ),
  0::bigint,
  'a repeat claim returns no already-started task'
);
select is(
  (
    select attempts_count
    from pgflow.step_tasks
    where message_id = :'valid_id'::bigint and queue_name = 'batchsafety__first'
  ),
  1,
  'a repeat claim does not increment attempts'
);

-- start_tasks extends claimed work only. The two unmatched messages retain
-- their one-second read visibility and recur after it expires.
select pg_sleep(2);
select array_agg(msg_id order by msg_id) as recurred_ids,
       min(read_ct) as min_recurred_reads
from pgmq.read('batchsafety__first', 1, 3) \gset
select is(
  :'recurred_ids'::bigint[],
  array[:'unmatched_id'::bigint, :'wrong_route_id'::bigint],
  'unmatched and wrong-route messages recur after visibility expires'
);
select is(
  :'min_recurred_reads'::int,
  2,
  'recurred messages record a second read'
);

select finish();
rollback;

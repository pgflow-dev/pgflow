\set ON_ERROR_STOP on
\set QUIET on

-- Force-skip across multiple private step queues (#651 review regression):
-- a completed ancestor whose two children hold queued tasks in two separate
-- private step queues must archive every queue's messages. The final
-- SELECT INTO must not stop after the first archived queue row, or the
-- second queue's message recurs indefinitely.
begin;
select plan(5);

select pgflow_tests.reset_db();

select pgflow.ensure_flow_compiled(
  'fskipmulti',
  '{
    "steps": [
      {"slug": "gate", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "left", "stepType": "single", "dependencies": ["gate"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "right", "stepType": "single", "dependencies": ["gate"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'step'
);

select run_id as gate_run_id from pgflow.start_flow('fskipmulti', '{}') \gset

-- Claim the root task from its private queue and complete it
select pgflow_tests.ensure_worker('fskipmulti__gate');
select array_agg(msg_id) as gate_ids
from pgmq.read_with_poll('fskipmulti__gate', 30, 1, 1, 50) \gset
select pgflow.start_tasks(
  'fskipmulti',
  :'gate_ids'::bigint[],
  '11111111-1111-1111-1111-111111111111'::uuid,
  'fskipmulti__gate',
  'gate'
);
select pgflow.complete_task(:'gate_run_id'::uuid, 'gate', 0, '{}'::jsonb);

select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'gate_run_id'::uuid and status = 'queued'),
  2::bigint,
  'Setup: both children dispatched a queued task'
);
select is(
  (select (select count(*) from pgmq.q_fskipmulti__left)
        + (select count(*) from pgmq.q_fskipmulti__right)),
  2::bigint,
  'Setup: one active message in each private child queue'
);

-- Force-skip the completed ancestor; the cascade skips both children
select pgflow._cascade_force_skip_steps(:'gate_run_id'::uuid, 'gate', 'condition_unmet');

select is(
  (select count(*) from pgmq.q_fskipmulti__left),
  0::bigint,
  'left child message left its private queue'
);
select is(
  (select count(*) from pgmq.q_fskipmulti__right),
  0::bigint,
  'right child message left its private queue'
);
select is(
  (select (select count(*) from pgmq.a_fskipmulti__left)
        + (select count(*) from pgmq.a_fskipmulti__right)),
  2::bigint,
  'both child messages archived in their private queues'
);

select * from finish();
rollback;

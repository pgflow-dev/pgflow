begin;
select plan(9);

select pgflow_tests.reset_db();

select pgflow.ensure_flow_compiled(
  'stallqueues',
  '{"steps":[
    {"slug":"doomed","stepType":"single","dependencies":[],"whenUnmet":"skip","whenExhausted":"fail","requiredInputPattern":{"defined":false},"forbiddenInputPattern":{"defined":false}},
    {"slug":"sibling","stepType":"single","dependencies":[],"whenUnmet":"skip","whenExhausted":"fail","requiredInputPattern":{"defined":false},"forbiddenInputPattern":{"defined":false}}
  ]}'::jsonb,
  'step'
);

select run_id as run_id from pgflow.start_flow('stallqueues', '{}'::jsonb) \gset
select pgflow_tests.ensure_worker('stallqueues__doomed');

select pgflow.start_tasks(
  'stallqueues',
  array[(select message_id from pgflow.step_tasks where flow_slug = 'stallqueues' and step_slug = 'doomed')],
  '11111111-1111-1111-1111-111111111111'::uuid,
  'stallqueues__doomed',
  'doomed'
);

update pgflow.step_tasks
set permanently_stalled_at = now(), requeued_count = 3
where run_id = :'run_id'::uuid and step_slug = 'doomed';

select is(
  pgflow.escalate_permanently_stalled(),
  1,
  'escalates the stalled task routed to its private queue'
);

select is(
  (select status from pgflow.runs where run_id = :'run_id'::uuid),
  'failed',
  'stalled task failure applies the run policy'
);

select is(
  (select count(*) from pgmq.q_stallqueues__doomed),
  0::bigint,
  'stalled task message leaves its private queue'
);

select is(
  (select count(*) from pgmq.a_stallqueues__doomed),
  1::bigint,
  'stalled task message is archived on its private queue'
);

select is(
  (select count(*) from pgmq.q_stallqueues__sibling),
  0::bigint,
  'cancelled sibling message leaves its separate private queue'
);

select is(
  (select count(*) from pgmq.a_stallqueues__sibling),
  1::bigint,
  'cancelled sibling message is archived on its private queue'
);

select is(
  (select remaining_steps from pgflow.runs where run_id = :'run_id'::uuid),
  2,
  'run step counter remains consistent after failure'
);

select is(
  pgflow_tests.count_realtime_events('run:failed', :'run_id'::uuid),
  1,
  'escalation emits one run failure event'
);

select is(
  pgflow_tests.count_realtime_events('step:failed', :'run_id'::uuid, 'doomed'),
  1,
  'escalation emits one step failure event'
);

select finish();
rollback;

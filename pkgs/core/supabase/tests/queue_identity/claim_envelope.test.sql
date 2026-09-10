-- Claim envelope identity rules (#650): exact durable pairs win over
-- malformed-looking components, a valid address that positively identifies
-- different work is fatal, and present-null identity keys are pgflow
-- evidence rather than foreign silence.
begin;
select plan(7);
select pgflow_tests.reset_db();

select pgflow.create_flow('Env', timeout => 5);
select pgflow.add_step('Env', 'first');
select pgflow.start_flow('Env', '{}');
select pgflow_tests.ensure_worker('env');

-- Case 1: exact durable pair with a malformed-looking body wins; the task
-- is claimed, not rejected.
update pgmq.q_env
set message = jsonb_set(message, '{run_id}', '"not-a-uuid"')
where msg_id = (select message_id from pgflow.step_tasks where task_index = 0);

create temporary table env_case1 as
select pgflow.claim_tasks(
  'env', 'Env',
  (select array_agg(message_id) from pgflow.step_tasks where task_index = 0),
  '11111111-1111-1111-1111-111111111111'::uuid
) as result;

select is(
  (select result->>'status' from env_case1),
  'ok',
  'exact pair with malformed run_id component still claims'
);
select is(
  (select jsonb_array_length(result->'tasks') from env_case1),
  1,
  'the durable pair is claimed once'
);

-- Case 2: a valid step address identifying different work is fatal. The
-- run_id is restored so only the step contradicts the durable pair.
update pgmq.q_env q
set message = jsonb_set(
  jsonb_set(q.message, '{step_slug}', '"otherStep"'),
  '{run_id}', to_jsonb(t.run_id::text)
)
from pgflow.step_tasks t
where t.queue_name = 'env' and t.task_index = 0 and q.msg_id = t.message_id;

select is(
  (select r->>'status' from pgflow.claim_tasks(
    'env', 'Env',
    (select array_agg(message_id) from pgflow.step_tasks where task_index = 0),
    '11111111-1111-1111-1111-111111111111'::uuid) as r),
  'fatal',
  'exact pair with a contradicting valid step address is fatal'
);

-- Case 3: present-null identity keys are pgflow evidence, not foreign
-- silence: fatal unsupported work.
select pgmq.send('env', '{"run_id": null}');

create temporary table env_case3 as
select pgflow.claim_tasks(
  'env', 'Env',
  ARRAY[(select max(msg_id) from pgmq.q_env)]::bigint[],
  '11111111-1111-1111-1111-111111111111'::uuid
) as result;

select is(
  (select result->>'status' from env_case3),
  'fatal',
  'present-null run_id without an exact pair is fatal'
);
select is(
  (select result->'errors'->0->>'reason' from env_case3),
  'unsupported_work',
  'the present-null envelope is unsupported work, not foreign'
);

-- Case 4: a valid flow address naming a different flow is wrong-route work.
select pgmq.send('env', '{"flow_slug":"Elsewhere"}');

create temporary table env_case4 as
select pgflow.claim_tasks(
  'env', 'Env',
  ARRAY[(select max(msg_id) from pgmq.q_env)]::bigint[],
  '11111111-1111-1111-1111-111111111111'::uuid
) as result;

select is(
  (select result->>'status' from env_case4),
  'fatal',
  'a different-flow envelope without an exact pair is fatal'
);
select is(
  (select result->'errors'->0->>'reason' from env_case4),
  'wrong_route',
  'the diagnostic names the wrong route'
);

select finish();
rollback;

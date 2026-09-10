-- Complete-batch claim classification (#650): one mixed read batch produces
-- distinct outcomes - claim, defer, terminal archive, foreign archive with a
-- body-free warning - and no second attempt on the started task.
begin;
select plan(11);
select pgflow_tests.reset_db();

select pgflow.create_flow('Mixed', timeout => 5);
select pgflow.add_step('Mixed', 'eachItem', step_type => 'map');
select pgflow.start_flow('Mixed', '[10, 20, 30]');
select pgflow_tests.ensure_worker('mixed');

-- t1 (index 1): claim once so it is started, then make its message visible again
select message_id as msg_id_1 from pgflow.step_tasks where task_index = 1 \gset
select pgflow.claim_tasks('mixed', 'Mixed', ARRAY[:msg_id_1]::bigint[],
  '11111111-1111-1111-1111-111111111111'::uuid);

-- t2 (index 2): terminal status with its message still in the queue
update pgflow.step_tasks
set status = 'completed', completed_at = now()
where flow_slug = 'Mixed' and task_index = 2;

-- Foreign untracked message
select pgmq.send('mixed', '{"hello":"world"}');

-- Make every active message visible for one mixed read batch
select pgflow_tests.reset_message_visibility('mixed');

create temporary table before_claim as
select task_index, started_at, attempts_count from pgflow.step_tasks;

create temporary table mixed_result as
select pgflow.claim_tasks(
  'mixed', 'Mixed',
  (select array_agg(msg_id order by msg_id) from pgmq.q_mixed),
  '11111111-1111-1111-1111-111111111111'::uuid
) as result;

select is(
  (select result->>'status' from mixed_result),
  'ok',
  'mixed batch with no fatal member claims successfully'
);
select is(
  (select jsonb_array_length(result->'tasks') from mixed_result),
  1,
  'exactly one task is claimed'
);
select is(
  (select result->'tasks'->0->>'task_index' from mixed_result),
  '0',
  'the queued task is the claimed one'
);
select is(
  (select attempts_count from pgflow.step_tasks where task_index = 1),
  (select attempts_count from before_claim where task_index = 1),
  'the started task gets no second attempt'
);
select is(
  (select started_at from pgflow.step_tasks where task_index = 1),
  (select started_at from before_claim where task_index = 1),
  'started_at is untouched by deferral'
);
select is(
  (select count(*)::int from pgmq.q_mixed),
  2,
  'claimed and deferred messages remain in the queue'
);
select is(
  (select count(*)::int from pgmq.a_mixed),
  2,
  'terminal and foreign messages are archived'
);
select is(
  (select jsonb_array_length(result->'warnings') from mixed_result),
  1,
  'exactly one body-free warning is returned'
);
select is(
  (select result->'warnings'->0->>'reason' from mixed_result),
  'foreign_message',
  'the warning names the foreign reason'
);
select ok(
  (select result::text from mixed_result) not like '%hello%',
  'no message body leaks into the result'
);
select ok(
  (select vt from pgmq.q_mixed where msg_id = :msg_id_1) > clock_timestamp() + interval '25 seconds',
  'the deferred started task keeps its +30 recovery deadline (not the +2 claim margin)'
);

select finish();
rollback;

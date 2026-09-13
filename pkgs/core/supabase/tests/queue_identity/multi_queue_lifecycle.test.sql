-- Multi-queue lifecycle (#650 review regression): when a run's tasks are
-- routed to more than one queue, terminal cleanup archives every queue's
-- messages. pgflow routes every step to the flow's default queue today, but
-- steps already carry a per-step queue route; this fixture re-routes one step
-- to a second queue before dispatch to prove no message stays active after
-- its task reaches a terminal state.
begin;
select plan(16);

select pgflow_tests.reset_db();

-- ----------------------------------------------------------------
-- Scenario 1: type violation in complete_task cancels across queues
-- ----------------------------------------------------------------
select pgflow.create_flow('mqviol');
select pgflow.add_step('mqviol', 'producer');
select pgflow.add_step('mqviol', 'sibling');
select pgflow.add_step('mqviol', 'consumer', array['producer'], step_type => 'map');
select pgmq.create('mqviol_side');
update pgflow.steps
set queue_name = 'mqviol_side'
where flow_slug = 'mqviol' and step_slug = 'sibling';

select run_id as viol_run_id from pgflow.start_flow('mqviol', '{}') \gset
select pgflow_tests.ensure_worker('mqviol');
select pgflow_tests.read_and_start('mqviol');

select pgflow.complete_task(
  :'viol_run_id'::uuid,
  'producer',
  0,
  '{"not": "an array"}'::jsonb
);

select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'viol_run_id'::uuid and status in ('queued', 'started')),
  0::bigint,
  'S1: no task left non-terminal after the type violation'
);

select is(
  (select count(*) from pgmq.q_mqviol),
  0::bigint,
  'S1: culprit message left the default queue'
);

select is(
  (select count(*) from pgmq.q_mqviol_side),
  0::bigint,
  'S1: cancelled sibling message left the side queue'
);

select is(
  (select count(*) from pgmq.a_mqviol),
  1::bigint,
  'S1: culprit message archived on the default queue'
);

select is(
  (select count(*) from pgmq.a_mqviol_side),
  1::bigint,
  'S1: cancelled sibling message archived on the side queue'
);

-- ----------------------------------------------------------------
-- Scenario 2: run failure in fail_task cancels across queues
-- ----------------------------------------------------------------
select pgflow.create_flow('mqfail');
select pgflow.add_step('mqfail', 'doomed', max_attempts => 1);
select pgflow.add_step('mqfail', 'sib_default');
select pgflow.add_step('mqfail', 'sib_side');
select pgmq.create('mqfail_side');
update pgflow.steps
set queue_name = 'mqfail_side'
where flow_slug = 'mqfail' and step_slug = 'sib_side';

select run_id as fail_run_id from pgflow.start_flow('mqfail', '"x"'::jsonb) \gset
select pgflow_tests.ensure_worker('mqfail');

-- Claim the doomed task and the side-queue sibling; sib_default stays queued
select array_agg(msg_id) as fail_doomed_ids
from pgmq.read_with_poll('mqfail', 30, 1, 1, 50) \gset
select pgflow.start_tasks(
  'mqfail',
  :'fail_doomed_ids'::bigint[],
  '11111111-1111-1111-1111-111111111111'::uuid
);

select array_agg(msg_id) as fail_sibling_ids
from pgmq.read_with_poll('mqfail_side', 30, 5, 1, 50) \gset
select pgflow.start_tasks(
  'mqfail',
  :'fail_sibling_ids'::bigint[],
  '11111111-1111-1111-1111-111111111111'::uuid,
  'mqfail_side'
);

select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'fail_run_id'::uuid and status = 'started'),
  2::bigint,
  'S2: claimed tasks started across two queues'
);

select pgflow.fail_task(:'fail_run_id'::uuid, 'doomed', 0, 'boom');

select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'fail_run_id'::uuid and status in ('queued', 'started')),
  0::bigint,
  'S2: no task left non-terminal after the run failed'
);

select is(
  (select count(*) from pgmq.q_mqfail),
  0::bigint,
  'S2: failed culprit and cancelled default-queue messages left the default queue'
);

select is(
  (select count(*) from pgmq.q_mqfail_side),
  0::bigint,
  'S2: cancelled sibling message left the side queue'
);

select is(
  (select count(*) from pgmq.a_mqfail),
  2::bigint,
  'S2: culprit and default-queue sibling archived on the default queue'
);

select is(
  (select count(*) from pgmq.a_mqfail_side),
  1::bigint,
  'S2: cancelled sibling message archived on the side queue'
);

-- ----------------------------------------------------------------
-- Scenario 3: condition failure in cascade_resolve_conditions cancels
-- across queues
-- ----------------------------------------------------------------
select pgflow.create_flow('mqcond');
select pgflow.add_step('mqcond', 'gate');
select pgflow.add_step('mqcond', 'sib_default');
select pgflow.add_step('mqcond', 'sib_side');
select pgflow.add_step(
  'mqcond',
  'guarded',
  array['gate'],
  required_input_pattern => '{"go": true}',
  when_unmet => 'fail'
);
select pgmq.create('mqcond_side');
update pgflow.steps
set queue_name = 'mqcond_side'
where flow_slug = 'mqcond' and step_slug = 'sib_side';

select run_id as cond_run_id from pgflow.start_flow('mqcond', '{}') \gset
select pgflow_tests.ensure_worker('mqcond');
select pgflow_tests.read_and_start('mqcond');

select pgflow.complete_task(
  :'cond_run_id'::uuid,
  'gate',
  0,
  '{"no": "go"}'::jsonb
);

select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'cond_run_id'::uuid and status in ('queued', 'started')),
  0::bigint,
  'S3: no task left non-terminal after the condition failed the run'
);

select is(
  (select count(*) from pgmq.q_mqcond),
  0::bigint,
  'S3: completed gate and cancelled default-queue messages left the default queue'
);

select is(
  (select count(*) from pgmq.q_mqcond_side),
  0::bigint,
  'S3: cancelled sibling message left the side queue'
);

select is(
  (select count(*) from pgmq.a_mqcond),
  2::bigint,
  'S3: gate and default-queue sibling archived on the default queue'
);

select is(
  (select count(*) from pgmq.a_mqcond_side),
  1::bigint,
  'S3: cancelled sibling message archived on the side queue'
);

select finish();
rollback;

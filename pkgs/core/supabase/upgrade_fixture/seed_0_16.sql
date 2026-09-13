-- 0.16.0 upgrade fixture seed: populated database state immediately before
-- the persist_queue_identity migration (#650). Runs on a database at 0.16.0
-- (migrations up to 20260907082520 only), using the 0.16.0 functions.

-- Plain lowercase flow with real dispatched messages
select pgflow.create_flow('plain_flow', null, null, 5);
select pgflow.add_step('plain_flow', 'a', max_attempts => 2, step_type => 'map');
select pgflow.start_flow('plain_flow', '[1,2]'::jsonb);

-- Mixed-case flow: 0.16.0 create_flow provisions the queue under the exact
-- slug spelling, so the physical queue is 'MixedCaseFlow'
select pgflow.create_flow('MixedCaseFlow', null, null, 5);
select pgflow.add_step('MixedCaseFlow', 'a', max_attempts => 2, step_type => 'map');
select pgflow.start_flow('MixedCaseFlow', '[10,20]'::jsonb);

-- Claim one plain_flow task so the upgraded database has a started task
insert into pgflow.workers (worker_id, queue_name, function_name, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111', 'plain_flow', 'fixture_worker', now());

create temp table fixture_msgs as
select msg_id from pgmq.read('plain_flow', 30, 1);

select pgflow.start_tasks(
  'plain_flow',
  (select array_agg(msg_id) from fixture_msgs),
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- Task with NULL message_id (pre-dispatch row): must backfill too
insert into pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, message_id)
select 'plain_flow', run_id, 'a', 97, null
from pgflow.runs
where flow_slug = 'plain_flow';

-- Task with a message id beyond the JavaScript safe integer range: must be
-- stored and compared exactly after the upgrade
insert into pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, message_id)
select 'plain_flow', run_id, 'a', 98, 9223372036854775807
from pgflow.runs
where flow_slug = 'plain_flow';

-- Empty flow: definition only, queue provisioned, no steps
select pgflow.create_flow('empty_flow');

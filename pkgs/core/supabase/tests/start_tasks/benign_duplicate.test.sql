-- Test: a visible message whose task is already started is a benign duplicate
-- Re-reading it consumes no attempt, returns no task, and does not block
-- fresh claims in the same batch.
begin;
select plan(9);

select pgflow_tests.reset_db();

-- Two root steps: root_a gets claimed first, then both messages become
-- readable in one mixed batch (duplicate for root_a + fresh for root_b)
select pgflow.create_flow('mixeddup', null, null, 5);
select pgflow.add_step('mixeddup', 'root_a');
select pgflow.add_step('mixeddup', 'root_b');

select pgflow.start_flow('mixeddup', '"x"'::jsonb);
select pgflow_tests.ensure_worker('mixeddup');

-- Claim exactly one task
select step_slug as first_claimed into temporary mixeddup_first
from pgflow_tests.read_and_start('mixeddup', 30, 1);

select is(
  (select count(*)::int from pgflow.step_tasks where status = 'started'),
  1,
  'one task claimed first'
);

-- Make the claimed task's message visible again (simulates expired visibility)
select is(
  pgflow_tests.reset_message_visibility('mixeddup'),
  1,
  'claimed message became visible again'
);

-- Mixed batch: duplicate message (started task) + fresh message (queued task)
select array_agg(msg_id order by msg_id) as ids into temporary mixeddup_msgs
from pgmq.read_with_poll('mixeddup', 30, 2, 1, 100);

select is(
  (select cardinality(ids) from mixeddup_msgs),
  2,
  'both messages read: one duplicate, one fresh'
);

with started as (
  select * from pgflow.start_tasks(
    'mixeddup',
    (select ids from mixeddup_msgs),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select is(
  (select count(*)::int from started),
  1,
  'mixed batch returns only the fresh task'
);

-- Fresh task returns with its vt extended to the claim-time delay
-- (flow 5 + 2 = 7s), not the initial PGMQ read visibility (30s)
select ok(
  (select abs(extract(epoch from (q.vt - now()))::int - 7) <= 2
   from pgmq.q_mixeddup q
   join pgflow.step_tasks st on st.message_id = q.msg_id
   where st.step_slug != (select first_claimed from mixeddup_first)),
  'fresh task in the mixed batch returns with its vt extended (flow 5 + 2 = 7s)'
);

with started as (
  select * from pgflow.start_tasks(
    'mixeddup',
    (select ids from mixeddup_msgs),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select is(
  (select count(*)::int from started
   where step_slug = (select first_claimed from mixeddup_first)),
  0,
  'the duplicate task is not returned'
);

select is(
  (select attempts_count::int from pgflow.step_tasks
   where step_slug = (select first_claimed from mixeddup_first)),
  1,
  'duplicate read consumes no additional attempt'
);

select is(
  (select attempts_count::int from pgflow.step_tasks
   where step_slug != (select first_claimed from mixeddup_first)),
  1,
  'fresh task in the mixed batch is claimed exactly once'
);

-- Repeated visibility: the duplicate keeps consuming nothing
select pgflow_tests.reset_message_visibility('mixeddup');
select msg_id into temporary mixeddup_dup_msg
from pgmq.read_with_poll('mixeddup', 30, 2, 1, 100)
where msg_id = (select message_id from pgflow.step_tasks
                where step_slug = (select first_claimed from mixeddup_first));

select is(
  (select count(*)::int from pgflow.start_tasks(
    'mixeddup',
    (select array_agg(msg_id) from mixeddup_dup_msg where msg_id is not null),
    '11111111-1111-1111-1111-111111111111'::uuid)),
  0,
  'repeatedly visible started message returns no task'
);

select finish();
rollback;

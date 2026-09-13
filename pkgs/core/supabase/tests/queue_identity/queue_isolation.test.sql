-- Queue isolation (#650): message ids are queue-scoped. A claim carrying the
-- wrong queue never crosses task identity; unmatched and wrong-flow messages
-- stay untouched while valid work from the same batch proceeds.
begin;
select plan(9);

select pgflow_tests.reset_db();

-- Two flows; both queues number their first message 1
select pgflow.create_flow('iso_a', null, null, 5);
select pgflow.add_step('iso_a', 'a', step_type => 'map');
select pgflow.start_flow('iso_a', '[10, 20]'::jsonb);

select pgflow.create_flow('iso_b', null, null, 5);
select pgflow.add_step('iso_b', 'b');
select pgflow.start_flow('iso_b', '"x"'::jsonb);

select is(
  (select count(*) from pgflow.step_tasks st
    join pgflow.step_tasks st2 on st2.message_id = st.message_id and st2.queue_name <> st.queue_name),
  2::bigint,
  'the same message id exists in both queues without crossing identity'
);

select pgflow_tests.ensure_worker('iso_a');
select pgflow_tests.ensure_worker('iso_b');

-- Read queue iso_a once: messages [1, 2]
select array_agg(msg_id) as ids_a into temporary iso_a_msgs
from pgmq.read_with_poll('iso_a', 30, 5, 1, 50);

select is(
  (select cardinality(ids_a) from iso_a_msgs)::text,
  '2',
  'both messages read from queue iso_a'
);

-- Claim with an explicitly mismatched queue name claims nothing
select is(
  (select count(*) from pgflow.start_tasks(
    'iso_a',
    (select ids_a from iso_a_msgs),
    '11111111-1111-1111-1111-111111111111'::uuid,
    'elsewhere'
  ))::int,
  0,
  'claim with a mismatched queue name claims nothing'
);

-- A worker polling queue iso_a but asking for flow iso_b claims nothing:
-- the (queue_name, message_id) identity does not authorize a cross-flow claim
select is(
  (select count(*) from pgflow.start_tasks(
    'iso_b',
    (select ids_a from iso_a_msgs),
    '11111111-1111-1111-1111-111111111111'::uuid,
    'iso_a'
  ))::int,
  0,
  'claim for another flow through a foreign queue claims nothing'
);

-- Defaulted queue name (released signature) still claims the queued tasks
select is(
  (select count(*) from pgflow.start_tasks(
    'iso_a',
    (select ids_a from iso_a_msgs),
    '11111111-1111-1111-1111-111111111111'::uuid
  ))::int,
  2,
  'defaulted queue name claims both iso_a tasks'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'iso_b'),
  'queued',
  'identical message id in queue iso_b is untouched'
);

-- Unmatched message: no task row for it. It is preserved, not archived, not
-- deleted, and valid work continues in the same batch.
select pgmq.send('iso_b', '{"foreign": true}'::jsonb);

select array_agg(msg_id) as ids_b into temporary iso_b_msgs
from pgmq.read_with_poll('iso_b', 30, 5, 1, 50);

select is(
  (select count(*) from pgflow.start_tasks(
    'iso_b',
    (select ids_b from iso_b_msgs),
    '11111111-1111-1111-1111-111111111111'::uuid
  ))::int,
  1,
  'the valid task in the batch is claimed'
);

select is(
  (select count(*) from pgmq.q_iso_b q
   where q.message->>'foreign' = 'true'),
  1::bigint,
  'unmatched message is preserved in the queue'
);

select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'iso_b' and status = 'started')::int,
  1,
  'valid work continued in the same batch'
);

select finish();
rollback;

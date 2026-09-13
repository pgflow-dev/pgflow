-- Deletion (#650 review correction): drop_queue addresses physical objects,
-- so every deletion resolves the listed spelling fresh through
-- pgmq.list_queues(). After drop -> recreate, a second deletion in the same
-- session must drop the recreated queue: no caching may authorize (or skip)
-- destructive work.
begin;
select plan(6);

select pgflow_tests.reset_db();

-- Legacy flow: canonical name stored, physical queue mixed-case
select pgflow.create_flow('AmbCase', null, null, 5);
select pgflow.add_step('AmbCase', 'a', max_attempts => 2);
select pgmq.drop_queue('ambcase');
select pgmq.create('AmbCase');

-- Dispatch a message to the mixed-case queue through the canonical name
select pgflow.start_flow('AmbCase', '"x"'::jsonb);

select is(
  (select count(*) from pgmq.q_AmbCase),
  1::bigint,
  'dispatch used the listed mixed-case spelling'
);

-- First deletion drops the listed spelling and the flow data
select pgflow.delete_flow_and_data('AmbCase');

select is(
  (select count(*) from pgmq.list_queues() where lower(queue_name) = 'ambcase'),
  0::bigint,
  'first deletion drops the mixed-case queue'
);

select is(
  (select count(*) from pgflow.flows where lower(flow_slug) = 'ambcase'),
  0::bigint,
  'first deletion removes the flow'
);

-- Recreate the flow: the queue now exists under the canonical spelling
select pgflow.create_flow('AmbCase', null, null, 5);
select pgflow.add_step('AmbCase', 'a');

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'ambcase'),
  1::bigint,
  'recreation provisions the canonical lowercase queue'
);

-- Second deletion in the same session: resolves the listed spelling fresh
select pgflow.delete_flow_and_data('AmbCase');

select is(
  (select count(*) from pgmq.list_queues() where lower(queue_name) = 'ambcase'),
  0::bigint,
  'second deletion drops the recreated queue through a fresh resolution'
);
select is(
  (select count(*) from pgflow.flows where lower(flow_slug) = 'ambcase'),
  0::bigint,
  'second deletion removes the recreated flow'
);

select finish();
rollback;

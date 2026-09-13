-- Deletion (#650): a flow's queues are dropped through the persisted
-- definition routes, resolved to their original listed spelling, including
-- the default queue of an empty flow. Deletion stays transactional.
begin;
select plan(7);

select pgflow_tests.reset_db();

-- Flow with a legacy mixed-case physical queue
select pgflow.create_flow('DropCase', null, null, 5);
select pgflow.add_step('DropCase', 'a');
select pgmq.drop_queue('dropcase');
select pgmq.create('DropCase');
select pgflow.start_flow('DropCase', '"x"'::jsonb);

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'DropCase'),
  1::bigint,
  'physical mixed-case queue in place before deletion'
);

select pgflow.delete_flow_and_data('DropCase');

select is(
  (select count(*) from pgmq.list_queues() where lower(queue_name) = 'dropcase'),
  0::bigint,
  'deletion drops the queue through its persisted route and original spelling'
);

select is(
  (select count(*) from pgflow.flows where flow_slug = 'DropCase'),
  0::bigint,
  'flow definition deleted'
);

-- Empty flow: default queue dropped without persisted routes
select pgflow.create_flow('DropEmpty');

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'dropempty'),
  1::bigint,
  'empty flow has its default queue'
);

select pgflow.delete_flow_and_data('DropEmpty');

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'dropempty'),
  0::bigint,
  'deletion drops the default queue of an empty flow'
);

-- Deleting a flow whose queue is already gone still removes the data
select pgflow.create_flow('DropGone');
select pgflow.add_step('DropGone', 'a');
select pgmq.drop_queue('dropgone');

select lives_ok(
  $$select pgflow.delete_flow_and_data('DropGone')$$,
  'deletion tolerates an already-dropped queue'
);

select is(
  (select count(*) from pgflow.steps where flow_slug = 'DropGone'),
  0::bigint,
  'definition removed when the queue was missing'
);

select finish();
rollback;

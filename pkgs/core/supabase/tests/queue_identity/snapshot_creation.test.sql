-- Queue identity snapshots (#650): task creation copies the step's resolved
-- default route (lower(flow_slug)) and stores it on every task row.
begin;
select plan(8);

select pgflow_tests.reset_db();

select pgflow.create_flow('SnapFlow', null, null, 5);
select pgflow.add_step('SnapFlow', 'first');
select pgflow.add_step('SnapFlow', 'second', ARRAY['first']);

select is(
  (select array_agg(queue_name order by step_slug) from pgflow.steps where flow_slug = 'SnapFlow'),
  array['snapflow', 'snapflow'],
  'add_step records the canonical lowercase default queue'
);

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'snapflow'),
  1::bigint,
  'create_flow provisions the lowercase default queue'
);

select pgflow.start_flow('SnapFlow', '"x"'::jsonb);

select is(
  (select count(*) from pgflow.step_tasks where queue_name = 'snapflow'),
  1::bigint,
  'task creation copies the step queue snapshot'
);

select is(
  (select queue_name from pgflow.step_tasks where step_slug = 'first'),
  'snapflow',
  'task row carries the stored queue name'
);

-- Mixed-case flow slug: canonical queue is still lower(flow_slug)
select pgflow.create_flow('MyFlow', null, null, 5);
select pgflow.add_step('MyFlow', 'a');

select is(
  (select queue_name from pgflow.steps where flow_slug = 'MyFlow'),
  'myflow',
  'mixed-case slug records the lowercase canonical queue name'
);

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'myflow'),
  1::bigint,
  'new mixed-case flow creates the lowercase queue'
);

select is(
  (select count(*) from pgmq.list_queues() where lower(queue_name) = 'myflow'),
  1::bigint,
  'no second metadata entry is created for the mixed-case flow'
);

select pgflow.start_flow('MyFlow', '"x"'::jsonb);

select is(
  (select queue_name from pgflow.step_tasks where flow_slug = 'MyFlow'),
  'myflow',
  'task under a mixed-case flow stores the canonical queue name'
);

select finish();
rollback;

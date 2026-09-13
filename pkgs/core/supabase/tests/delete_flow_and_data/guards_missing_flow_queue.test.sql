-- Deletion (#650): destructive queue work must be authorized by an exact
-- pgflow.flows row. A nonexistent flow slug must not drop a same-named
-- queue owned by someone else, and a wrong-case slug must not drop another
-- flow's queue or data (review regressions).
begin;
select plan(8);

select pgflow_tests.reset_db();

-- Nonexistent flow, existing same-named queue owned outside pgflow
select pgmq.create('guard650_external');

select lives_ok(
  $$select pgflow.delete_flow_and_data('guard650_external')$$,
  'deleting a nonexistent flow is a quiet no-op'
);

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'guard650_external'),
  1::bigint,
  'nonexistent flow does not drop the same-named external queue'
);

select is(
  (select count(*) from pgflow.flows where flow_slug = 'guard650_external'),
  0::bigint,
  'no flow row appeared'
);

-- Existing flow reached through a wrong-case slug: everything survives
select pgflow.create_flow('GuardCase');
select pgflow.add_step('GuardCase', 'a');
select pgflow.start_flow('GuardCase', '"x"'::jsonb);

select lives_ok(
  $$select pgflow.delete_flow_and_data('guardcase')$$,
  'wrong-case slug is a quiet no-op'
);

select is(
  (select count(*) from pgmq.list_queues() where lower(queue_name) = 'guardcase'),
  1::bigint,
  'wrong-case slug does not drop the flow queue'
);

select is(
  (select count(*) from pgflow.flows where flow_slug = 'GuardCase'),
  1::bigint,
  'wrong-case slug leaves the flow definition intact'
);

select is(
  (select count(*) from pgflow.steps where flow_slug = 'GuardCase'),
  1::bigint,
  'wrong-case slug leaves the flow data intact'
);

-- The exact slug still deletes flow, data, and queue
select pgflow.delete_flow_and_data('GuardCase');

select is(
  (select count(*) from pgmq.list_queues() where lower(queue_name) = 'guardcase'),
  0::bigint,
  'exact slug still drops the flow queue'
);

select finish();
rollback;

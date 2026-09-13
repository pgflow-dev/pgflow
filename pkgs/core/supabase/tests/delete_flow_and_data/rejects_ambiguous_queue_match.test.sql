-- Deletion must resolve every listed spelling of a normalized queue name
-- before destructive work: an ambiguous case-insensitive match is rejected
-- and the flow is left fully intact (#650 review regression).
begin;
select plan(6);

select pgflow_tests.reset_db();

-- Flow whose physical queue exists under two spellings of one name
-- (external damage), one of them the exact canonical spelling
select pgflow.create_flow('ambcase', null, null, 5);
select pgflow.add_step('ambcase', 'a');
select pgflow.start_flow('ambcase', '"x"'::jsonb);
select pgmq.drop_queue('ambcase');
select pgmq.create('ambcase');
select pgmq.create('AmbCase');

select throws_ok(
  $$select pgflow.delete_flow_and_data('ambcase')$$,
  'queue name "ambcase" is ambiguous: it matches listed queues {ambcase,AmbCase}',
  'deletion rejects the ambiguous match before destructive work'
);

select is(
  (select count(*) from pgflow.flows where flow_slug = 'ambcase'),
  1::bigint,
  'flow definition intact after rejection'
);

select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'ambcase'),
  1::bigint,
  'runtime data intact after rejection'
);

select is(
  (select count(*) from pgmq.list_queues() where lower(queue_name) = 'ambcase'),
  2::bigint,
  'both queue spellings still listed after rejection'
);

-- Fresh resolution rejects the ambiguous pair even when one spelling is the
-- exact canonical name: message operations resolve through this function
-- on a cold session (worker restart), so the exact match must not
-- short-circuit the ambiguity rejection
select throws_ok(
  $$select pgflow._listed_queue_name('ambcase')$$,
  'queue name "ambcase" is ambiguous: it matches listed queues {ambcase,AmbCase}',
  'fresh resolution rejects the ambiguous match before any message operation'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'ambcase'),
  'queued',
  'task untouched after the rejected archive'
);

select finish();
rollback;

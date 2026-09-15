-- Mode-aware deletion and pruning routes (#651): deletion drops only the
-- old mode's owned queue set with the existing exact-flow guard; the
-- manually installed pruning helper never prunes an unrelated default-name
-- queue for a step-mode flow.
begin;
select plan(8);

select pgflow_tests.reset_db();

-- Step mode: deletion drops exactly the persisted step queues and never an
-- unrelated default-name queue
select pgflow.ensure_flow_compiled(
  'delStep',
  '{
    "steps": [
      {"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "b", "stepType": "single", "dependencies": ["a"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'step'
);

-- An unrelated external queue happens to own the default-flow-queue name
select pgmq.create('delstep');

select pgflow.delete_flow_and_data('delStep');

select is(
  (
    select count(*)
    from pgmq.list_queues()
    where queue_name in ('delstep__a', 'delstep__b')
  ),
  0::bigint,
  'deletion drops the step-mode owned queues'
);

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'delstep'),
  1::bigint,
  'step-mode deletion never drops the unrelated default-name queue'
);

select is(
  (select count(*) from pgflow.flows where flow_slug = 'delStep'),
  0::bigint,
  'definition is deleted'
);

-- Flow mode: deletion keeps dropping the default queue, including for an
-- empty flow
select pgflow.create_flow('delEmpty');
select pgflow.delete_flow_and_data('delEmpty');
select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'delempty'),
  0::bigint,
  'flow-mode deletion drops the empty flow default queue'
);

-- Wrong-case slug must not drop any queue (exact-flow guard, #650)
select pgflow.ensure_flow_compiled(
  'delCase',
  '{"steps": [{"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}]}'::jsonb,
  'step'
);
select pgflow.delete_flow_and_data('delcase');
select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'delcase__a'),
  1::bigint,
  'wrong-case deletion drops nothing'
);
select pgflow.delete_flow_and_data('delCase');

-- Pruning helper route set: step mode never prunes the default-name queue
\i _shared/prune_data_older_than.sql.raw

select pgflow.ensure_flow_compiled(
  'pruneStep',
  '{
    "steps": [
      {"slug": "a", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}},
      {"slug": "b", "stepType": "single", "dependencies": ["a"], "whenUnmet": "skip", "whenExhausted": "fail", "requiredInputPattern": {"defined": false}, "forbiddenInputPattern": {"defined": false}}
    ]
  }'::jsonb,
  'step'
);
select pgflow.start_flow('pruneStep', '"x"'::jsonb);

-- Archival tables must exist for the prune path to walk them
select pgmq.archive(
  'prunestep__a',
  array[(select message_id from pgflow.step_tasks where flow_slug = 'pruneStep' and step_slug = 'a' limit 1)]
);

-- An archive table with the default-flow-queue name exists (from an
-- unrelated queue); pruning must not touch it
select pgmq.create('prunestep');
select pgmq.send('prunestep', '"keep"'::jsonb);
select pgmq.archive('prunestep', array[(select msg_id from pgmq.read('prunestep', 0, 1) limit 1)]);

-- Age everything past the retention window by backdating archived rows
update pgmq.a_prunestep__a set archived_at = now() - interval '90 days';
update pgmq.a_prunestep set archived_at = now() - interval '90 days';

select pgflow.prune_data_older_than(interval '30 days');

select is(
  (select count(*) from pgmq.a_prunestep__a),
  0::bigint,
  'step-mode archive table is pruned through persisted routes'
);

select is(
  (select count(*) from pgmq.a_prunestep),
  1::bigint,
  'step mode never prunes an unrelated default-name archive table'
);

-- Flow mode keeps pruning the default queue archive
select pgflow.create_flow('pruneFlow');
select pgflow.add_step('pruneFlow', 'a');
select pgflow.start_flow('pruneFlow', '"x"'::jsonb);
select pgmq.archive(
  'pruneflow',
  array[(select message_id from pgflow.step_tasks where flow_slug = 'pruneFlow' and step_slug = 'a' limit 1)]
);
update pgmq.a_pruneflow set archived_at = now() - interval '90 days';
select pgflow.prune_data_older_than(interval '30 days');
select is(
  (select count(*) from pgmq.a_pruneflow),
  0::bigint,
  'flow-mode default queue archive is still pruned'
);

select finish();
rollback;

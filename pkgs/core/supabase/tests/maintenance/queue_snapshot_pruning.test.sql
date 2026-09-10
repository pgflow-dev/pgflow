-- Queue-aware optional pruning (#650): active cleanup groups by task queue
-- snapshot, archive retention enumerates persisted routes (including empty
-- compiled plain defaults), and NULL message IDs stay valid.
\i _shared/prune_data_older_than.sql.raw
begin;
select plan(8);
select pgflow_tests.reset_db();

-- Flow A: completed run with live message (worker crashed mid-processing)
select pgflow.create_flow('prA', timeout => 1);
select pgflow.add_step('prA', 'first');
select pgflow.start_flow('prA', '{}');
update pgflow.runs
set started_at = now() - interval '45 days',
    status = 'completed', completed_at = now() - interval '40 days'
where flow_slug = 'prA';
update pgflow.step_tasks set queued_at = now() - interval '45 days' where flow_slug = 'prA';

-- Flow B: recent run that must survive entirely
select pgflow.create_flow('prB', timeout => 1);
select pgflow.add_step('prB', 'first');
select pgflow.start_flow('prB', '{}');
update pgflow.runs
set started_at = now() - interval '6 days',
    status = 'completed', completed_at = now() - interval '5 days'
where flow_slug = 'prB';

-- Flow C: empty compiled plain flow (no steps, no runs) with an old archived
-- message in its default archive table
select pgflow.create_flow('prC');
select pgmq.create('prc');
select pgmq.send('prc', '{"hello":"world"}');
select pgmq.archive('prc', (select msg_id from pgmq.q_prc limit 1));
update pgmq.a_prc set archived_at = now() - interval '40 days';

-- A second queue whose archive holds both old and recent messages; it is
-- routed by a persisted definition route, so it must be pruned by route name
select pgflow.create_flow('prD');
select pgflow.add_step('prD', 'only');select pgmq.send('prd', '{"old":1}');
select pgmq.archive('prd', (select msg_id from pgmq.q_prd limit 1));
update pgmq.a_prd set archived_at = now() - interval '40 days';
select pgmq.send('prd', '{"new":1}');
select pgmq.archive('prd', (select msg_id from pgmq.q_prd limit 1));

-- An unrelated application queue's archive must not be scanned
select pgmq.create('prOther');
select pgmq.send('prOther', '{"old":1}');
select pgmq.archive('prOther', (select msg_id from pgmq.q_prOther limit 1));
update pgmq.a_prother set archived_at = now() - interval '40 days';

select lives_ok(
  $$select pgflow.prune_data_older_than(make_interval(days => 30))$$,
  'pruning runs cleanly'
);

select is(
  (select count(*)::int from pgmq.q_prA),
  0,
  'old completed run active message is deleted by task snapshot'
);
select is(
  (select count(*)::int from pgflow.step_tasks where flow_slug = 'prA'),
  0,
  'old completed run task rows are deleted'
);
select is(
  (select count(*)::int from pgflow.step_tasks where flow_slug = 'prB'),
  1,
  'recent run tasks survive'
);
select is(
  (select count(*)::int from pgmq.q_prB),
  1,
  'recent run message survives'
);
select is(
  (select count(*)::int from pgmq.a_prc),
  0,
  'empty compiled plain default archive is pruned by route'
);
select is(
  (select message->>'new' from pgmq.a_prd),
  '1',
  'recent archive entries survive while old ones are pruned'
);
select is(
  (select count(*)::int from pgmq.a_prOther),
  1,
  'an unrelated application archive is untouched'
);

select finish();
rollback;

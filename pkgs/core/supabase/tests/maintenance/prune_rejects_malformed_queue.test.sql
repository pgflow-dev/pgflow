-- #650 review: pruning validates every route it will touch with
-- _inspect_generated_queue before any queue access. A malformed queue with
-- the same canonical name (here: the valid vt index replaced by a partial
-- one, as a dropped-and-recreated external replacement could produce) must
-- stop pruning atomically instead of deleting from that queue.
\i _shared/prune_data_older_than.sql.raw
begin;
select plan(3);
select pgflow_tests.reset_db();

select pgflow.create_flow('prMal');
select pgflow.add_step('prMal', 'first');
select pgflow.start_flow('prMal', '{}');
update pgflow.runs
set started_at = now() - interval '45 days',
    status = 'completed', completed_at = now() - interval '40 days'
where flow_slug = 'prMal';

-- Corrupt the generated queue's physical shape in place.
drop index pgmq.q_prmal_vt_idx;

select throws_ok(
  $$select pgflow.prune_data_older_than(make_interval(days => 30))$$,
  'P0001',
  null,
  'pruning refuses a malformed queue with the same canonical name'
);

select is(
  (select count(*)::int from pgflow.runs where flow_slug = 'prMal'),
  1,
  'the expired run survives the rejected pruning pass'
);
select is(
  (select count(*)::int from pgflow.step_tasks where flow_slug = 'prMal'),
  1,
  'task rows survive the rejected pruning pass'
);

select finish();
rollback;

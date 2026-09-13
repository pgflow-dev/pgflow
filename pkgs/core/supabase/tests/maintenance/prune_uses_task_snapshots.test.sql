-- Pruning (#650): the optional helper cleans PGMQ messages through task
-- snapshots and archives through persisted definition routes, so a queue
-- that keeps an original mixed-case spelling is still cleaned.
begin;
select plan(6);

select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Flow with a legacy mixed-case physical queue
select pgflow.create_flow('PruneCase', null, null, 5);
select pgflow.add_step('PruneCase', 'a');
select pgmq.drop_queue('prunecase');
select pgmq.create('PruneCase');
select pgflow.start_flow('PruneCase', '"x"'::jsonb);

select pgflow_tests.ensure_worker('PruneCase');
select pgflow_tests.read_and_start('PruneCase');
select pgflow.complete_task(
  (select run_id from pgflow.runs where flow_slug = 'PruneCase'),
  'a',
  0,
  null
);

select is(
  (select count(*) from pgmq.a_PruneCase),
  1::bigint,
  'message archived on the physical mixed-case archive table'
);

-- Age the run past retention
select pgflow_tests.set_completed_flow_timestamps('PruneCase', 40);
update pgmq.a_PruneCase set archived_at = now() - interval '40 days';

select pgflow.prune_data_older_than(make_interval(days => 30));

select is(
  (select count(*) from pgflow.runs where flow_slug = 'PruneCase'),
  0::bigint,
  'old run pruned'
);

select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'PruneCase'),
  0::bigint,
  'old tasks pruned'
);

-- Queue cleanup uses task snapshots: nothing left to delete but the route
-- walk still resolves the mixed-case archive table
select is(
  (select count(*) from pgmq.a_PruneCase),
  0::bigint,
  'archive cleaned through the persisted route'
);

-- Active-queue message cleanup through task snapshots: a queued message of
-- an old failed run is deleted from the physical queue
select pgflow.create_flow('PruneAct', null, null, 5);
select pgflow.add_step('PruneAct', 'a');
select pgmq.drop_queue('pruneact');
select pgmq.create('PruneAct');
select pgflow.start_flow('PruneAct', '"x"'::jsonb);
-- leave the task queued (message invisible via a long read window)
select pgmq.read_with_poll('PruneAct', 3600, 5, 1, 10);

select is(
  (select count(*) from pgmq.q_PruneAct),
  1::bigint,
  'queued message present on the physical queue before pruning'
);

update pgflow.runs
set started_at = now() - interval '41 days',
    failed_at = now() - interval '40 days',
    status = 'failed'
where flow_slug = 'PruneAct';

select pgflow.prune_data_older_than(make_interval(days => 30));

select is(
  (select count(*) from pgmq.q_PruneAct),
  0::bigint,
  'active-queue message deleted through the task snapshot'
);

select finish();
rollback;

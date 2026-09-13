-- Pruning (#650): the optional helper cleans PGMQ messages through task
-- snapshots and archives through persisted definition routes, so a queue
-- that keeps an original mixed-case spelling is still cleaned. The helper
-- never consults the pgmq queue listing: pgmq.list_queues() is shadowed
-- with a raising function before the prune runs, and setup (which does use
-- the listing for provisioning collision checks) runs before the trap.
begin;
select plan(7);

select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Flow with a legacy mixed-case physical queue, completed and aged out
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

-- Arm the trap: the archive walk must derive table names without the listing
create or replace function pgmq.list_queues()
returns setof pgmq.queue_record
language plpgsql
as $$
begin
  raise exception 'pruning called pgmq.list_queues()';
end;
$$;

select lives_ok(
  $$ select pgflow.prune_data_older_than(make_interval(days => 30)) $$,
  'prune completed without the queue listing'
);

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

-- Archive cleanup walks persisted routes and pgmq.format_table_name()
-- lowercases the route itself, so the mixed-case archive table is found
-- without resolving the listed spelling
select is(
  (select count(*) from pgmq.a_PruneCase),
  0::bigint,
  'archive cleaned through the persisted route without the queue listing'
);

select is(
  (select count(*) from pgmq.q_PruneAct),
  0::bigint,
  'active-queue message deleted through the task snapshot'
);

select finish();
rollback;

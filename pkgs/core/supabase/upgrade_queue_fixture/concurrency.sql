-- 0.16.0 queue upgrade fixture concurrency blockers (#650).
-- Each section starts with "-- blocker: <name>" and holds ONE transaction that
-- holds a lock the migration must respect. The runner starts a section on its
-- own connection (application_name=queue_fixture_blocker), starts the real
-- migration, and requires either a bounded lock-timeout failure with unchanged
-- state, or completion. Cleanup terminates the blocker backend.

-- blocker: producer
-- Open producer transaction holding a run row lock.
begin;
select 1 from pgflow.runs where flow_slug = 'Orders' for update;
select pg_sleep(60);
rollback;

-- blocker: definition
-- Open definition transaction holding pgflow.flows locks.
begin;
update pgflow.flows set opt_timeout = opt_timeout where flow_slug = 'Orders';
select pg_sleep(60);
rollback;

-- blocker: queue_topology
-- External PGMQ topology change holding the metadata fence.
begin;
lock table pgmq.meta in share row exclusive mode;
select pg_sleep(60);
rollback;

-- blocker: queue_create
-- External PGMQ queue creation at the topology fence: it creates physical
-- objects and holds the pgmq.meta row lock. The migration must fail within
-- the 5-second lock bound and change nothing.
begin;
select pgmq.create('concurrent_app_queue');
select pg_sleep(60);
rollback;

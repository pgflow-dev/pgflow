create extension if not exists pgmq version '1.4.4';

create schema if not exists edge_worker;

-- TODO: move to worker startup
select pgmq.create('tasks');

-------------------------------------------------------------------------------
-- Workers Table --------------------------------------------------------------
-------------------------------------------------------------------------------
create table if not exists edge_worker.workers (
    worker_id UUID not null primary key,
    queue_name TEXT not null,
    function_name TEXT not null,
    started_at TIMESTAMPTZ not null default now(),
    stopped_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ not null default now()
);

-------------------------------------------------------------------------------
-- Active Workers View --------------------------------------------------------
-------------------------------------------------------------------------------
create or replace view edge_worker.active_workers as
select
    worker_id,
    queue_name,
    function_name,
    started_at,
    stopped_at,
    last_heartbeat_at
from edge_worker.workers
where
    stopped_at is null
    and last_heartbeat_at > now() - make_interval(secs => 6);

-------------------------------------------------------------------------------
-- Inactive Workers View ------------------------------------------------------
-------------------------------------------------------------------------------
create or replace view edge_worker.inactive_workers as
select
    worker_id,
    queue_name,
    function_name,
    started_at,
    stopped_at,
    last_heartbeat_at
from edge_worker.workers
where
    stopped_at is null
    and last_heartbeat_at < now() - make_interval(secs => 6);

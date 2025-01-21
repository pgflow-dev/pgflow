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

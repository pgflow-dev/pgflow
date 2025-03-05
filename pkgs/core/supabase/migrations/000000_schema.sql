create extension if not exists pgmq version '1.4.4';

create schema if not exists pgflow;
set search_path to pgflow;

--------------------------------------------------------------------------
------------------ TODO: fix me, UNSECURE --------------------------------
--------------------------------------------------------------------------
grant usage on schema pgflow to anon, authenticated, service_role;
grant all on all tables in schema pgflow to anon, authenticated, service_role;
grant all on all routines in schema pgflow to anon, authenticated, service_role;
grant all on all sequences in schema pgflow to anon,
authenticated,
service_role;
alter default privileges for role postgres in schema pgflow
grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema pgflow
grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema pgflow
grant all on sequences to anon, authenticated, service_role;

select pgmq.create('pgflow');

------------------------------------------
-- Core flow definition tables
------------------------------------------

----- check constraint helper function -------
create or replace function pgflow.is_valid_slug(
    slug text
)
returns boolean
language plpgsql
immutable
as $$
begin
    return
      slug is not null
      and slug <> ''
      and length(slug) <= 128
      and slug ~ '^[a-zA-Z_][a-zA-Z0-9_]*$';
end;
$$;

-- Flows table - stores flow definitions
create table pgflow.flows (
    flow_slug text primary key not null  -- Unique identifier for the flow
    check (is_valid_slug(flow_slug))
);

-- Steps table - stores individual steps within flows
create table pgflow.steps (
    flow_slug text not null references flows (flow_slug),
    step_slug text not null,
    primary key (flow_slug, step_slug),
    check (is_valid_slug(step_slug))
);

-- Dependencies table - stores relationships between steps
create table pgflow.deps (
    flow_slug text not null references pgflow.flows (flow_slug),
    dep_slug text not null, -- slug of the dependency 
    step_slug text not null, -- slug of the dependent
    primary key (flow_slug, dep_slug, step_slug),
    foreign key (flow_slug, dep_slug)
    references pgflow.steps (flow_slug, step_slug),
    foreign key (flow_slug, step_slug)
    references pgflow.steps (flow_slug, step_slug),
    check (dep_slug != step_slug)  -- Prevent self-dependencies
);

------------------------------------------
-- Runtime State Tables
------------------------------------------

-- Runs table - tracks flow execution instances
drop table if exists pgflow.step_states;
drop table if exists pgflow.runs;
create table pgflow.runs (
    flow_slug text not null references pgflow.flows (flow_slug),
    run_id uuid primary key not null default gen_random_uuid(),
    status text not null default 'started',
    payload jsonb not null,
    check (status in ('started', 'failed', 'completed'))
);

-- Step states table - tracks the state of individual steps within a run
create table pgflow.step_states (
    flow_slug text not null references pgflow.flows (flow_slug),
    run_id uuid not null references pgflow.runs (run_id),
    step_slug text not null,
    status text not null default 'created',
    check (status in ('created', 'started', 'completed', 'failed'))
);

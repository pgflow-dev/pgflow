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
      and slug ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
      and slug NOT IN ('run'); -- reserved words
end;
$$;

-- Flows table - stores flow definitions
create table pgflow.flows (
  flow_slug text primary key not null,  -- Unique identifier for the flow
  retry_limit int not null default 3,
  retry_delay int not null default 5,
  constraint slug_is_valid check (is_valid_slug(flow_slug)),
  constraint retry_limit_is_nonnegative check (retry_limit >= 0),
  constraint retry_delay_is_nonnegative check (retry_delay >= 0)
);

-- Steps table - stores individual steps within flows
create table pgflow.steps (
  flow_slug text not null references flows (flow_slug),
  step_slug text not null,
  step_type text not null default 'single',
  deps_count int not null default 0 check (deps_count >= 0),
  retry_limit int,
  retry_delay int,
  primary key (flow_slug, step_slug),
  check (is_valid_slug(step_slug)),
  check (step_type in ('single')),
  constraint retry_limit_is_nonnegative check (retry_limit is null or retry_limit >= 0),
  constraint retry_delay_is_nonnegative check (retry_delay is null or retry_delay >= 0)
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
create table pgflow.runs (
  run_id uuid primary key not null default gen_random_uuid(),
  flow_slug text not null references pgflow.flows (flow_slug), -- denormalized
  status text not null default 'started',
  input jsonb not null,
  output jsonb,
  remaining_steps int not null default 0 check (remaining_steps >= 0),
  check (status in ('started', 'failed', 'completed'))
);

-- Step states table - tracks the state of individual steps within a run
create table pgflow.step_states (
  flow_slug text not null references pgflow.flows (flow_slug),
  run_id uuid not null references pgflow.runs (run_id),
  step_slug text not null,
  status text not null default 'created',
  remaining_tasks int not null default 1 check (remaining_tasks >= 0),
  remaining_deps int not null default 0 check (remaining_deps >= 0),
  primary key (run_id, step_slug),
  foreign key (flow_slug, step_slug)
  references pgflow.steps (flow_slug, step_slug),
  check (status in ('created', 'started', 'completed', 'failed')),
  check (status != 'completed' or remaining_tasks = 0)
);

-- Step tasks table - tracks units of work for step
create table pgflow.step_tasks (
  flow_slug text not null references pgflow.flows (flow_slug),
  run_id uuid not null references pgflow.runs (run_id),
  step_slug text not null,
  message_id bigint,
  task_index int not null default 0,
  status text not null default 'queued',
  retry_count int not null default 0,
  error_message text,
  output jsonb,
  constraint step_tasks_pkey primary key (run_id, step_slug, task_index),
  foreign key (run_id, step_slug)
  references pgflow.step_states (run_id, step_slug),
  constraint valid_status check (
    status in ('queued', 'completed', 'failed')
  ),
  constraint output_valid_only_for_completed check (
    output is null or status = 'completed'
  ),
  constraint only_single_task_per_step check (task_index = 0),
  constraint retry_count_nonnegative check (retry_count >= 0)
);

------------------------------------------
-- Types
------------------------------------------

create type pgflow.worker_task as (
  flow_slug TEXT,
  run_id UUID,
  step_slug TEXT,
  input JSONB
);

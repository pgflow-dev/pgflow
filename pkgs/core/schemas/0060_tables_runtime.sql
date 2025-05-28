-- Runtime State Tables

-- Runs table - tracks flow execution instances
create table pgflow.runs (
  run_id uuid primary key not null default gen_random_uuid(),
  flow_slug text not null references pgflow.flows (flow_slug), -- denormalized
  status text not null default 'started',
  input jsonb not null,
  output jsonb,
  remaining_steps int not null default 0 check (remaining_steps >= 0),
  realtime_channel text check (realtime_channel is null or length(realtime_channel) > 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  constraint completed_at_or_failed_at check (not (completed_at is not null and failed_at is not null)),
  constraint completed_at_is_after_started_at check (completed_at is null or completed_at >= started_at),
  constraint failed_at_is_after_started_at check (failed_at is null or failed_at >= started_at),
  constraint status_is_valid check (status in ('started', 'failed', 'completed'))
);

create index if not exists idx_runs_flow_slug on pgflow.runs (flow_slug);
create index if not exists idx_runs_status on pgflow.runs (status);
create index if not exists idx_runs_realtime_channel on pgflow.runs (realtime_channel);

-- Step states table - tracks the state of individual steps within a run
create table pgflow.step_states (
  flow_slug text not null references pgflow.flows (flow_slug),
  run_id uuid not null references pgflow.runs (run_id),
  step_slug text not null,
  status text not null default 'created',
  remaining_tasks int not null default 1 check (remaining_tasks >= 0),
  remaining_deps int not null default 0 check (remaining_deps >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  primary key (run_id, step_slug),
  foreign key (flow_slug, step_slug)
  references pgflow.steps (flow_slug, step_slug),
  constraint status_is_valid check (status in ('created', 'started', 'completed', 'failed')),
  constraint status_and_remaining_tasks_match check (status != 'completed' or remaining_tasks = 0),
  constraint completed_at_or_failed_at check (not (completed_at is not null and failed_at is not null)),
  constraint started_at_is_after_created_at check (started_at is null or started_at >= created_at),
  constraint completed_at_is_after_started_at check (completed_at is null or completed_at >= started_at),
  constraint failed_at_is_after_started_at check (failed_at is null or failed_at >= started_at)
);

create index if not exists idx_step_states_ready on pgflow.step_states (run_id, status, remaining_deps) where status
= 'created'
and remaining_deps = 0;
create index if not exists idx_step_states_failed on pgflow.step_states (run_id, step_slug) where status = 'failed';
create index if not exists idx_step_states_flow_slug on pgflow.step_states (flow_slug);
create index if not exists idx_step_states_run_id on pgflow.step_states (run_id);

-- Step tasks table - tracks units of work for step
create table pgflow.step_tasks (
  flow_slug text not null references pgflow.flows (flow_slug),
  run_id uuid not null references pgflow.runs (run_id),
  step_slug text not null,
  message_id bigint,
  task_index int not null default 0,
  status text not null default 'queued',
  attempts_count int not null default 0,
  error_message text,
  output jsonb,
  queued_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
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
  constraint attempts_count_nonnegative check (attempts_count >= 0),
  constraint completed_at_or_failed_at check (not (completed_at is not null and failed_at is not null)),
  constraint completed_at_is_after_queued_at check (completed_at is null or completed_at >= queued_at),
  constraint failed_at_is_after_queued_at check (failed_at is null or failed_at >= queued_at)
);

create index if not exists idx_step_tasks_message_id on pgflow.step_tasks (message_id);
create index if not exists idx_step_tasks_queued on pgflow.step_tasks (run_id, step_slug) where status = 'queued';
create index if not exists idx_step_tasks_completed on pgflow.step_tasks (run_id, step_slug) where status = 'completed';
create index if not exists idx_step_tasks_failed on pgflow.step_tasks (run_id, step_slug) where status = 'failed';
create index if not exists idx_step_tasks_flow_run_step on pgflow.step_tasks (flow_slug, run_id, step_slug);

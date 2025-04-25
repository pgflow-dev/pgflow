-- Runtime State Tables

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
  attempts_count int not null default 0,
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
  constraint attempts_count_nonnegative check (attempts_count >= 0)
);

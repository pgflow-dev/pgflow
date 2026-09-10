-- Runtime State Tables

-- Runs table - tracks flow execution instances
create table pgflow.runs (
  run_id uuid primary key not null default gen_random_uuid(),
  flow_slug text not null references pgflow.flows(flow_slug), -- denormalized
  status text not null default 'started',
  input jsonb not null,
  output jsonb,
  remaining_steps int not null default 0 check (remaining_steps >= 0),
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

-- Step states table - tracks the state of individual steps within a run
create table pgflow.step_states (
  flow_slug text not null references pgflow.flows(flow_slug),
  run_id uuid not null references pgflow.runs(run_id),
  step_slug text not null,
  status text not null default 'created',
  remaining_tasks int null,  -- NULL = not started, >0 = active countdown
  initial_tasks int null check (initial_tasks is null or initial_tasks >= 0),
  remaining_deps int not null default 0 check (remaining_deps >= 0),
  output jsonb,  -- Step output: stored atomically with status=completed transition
  error_message text,
  skip_reason text,  -- Why step was skipped: condition_unmet, handler_failed, dependency_skipped
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  skipped_at timestamptz,
  primary key (run_id, step_slug),
  foreign key (flow_slug, step_slug)
  references pgflow.steps(flow_slug, step_slug),
  constraint status_is_valid check (status in ('created', 'started', 'completed', 'failed', 'skipped')),
  constraint status_and_remaining_tasks_match check (status != 'completed' or remaining_tasks = 0),
  -- Add constraint to ensure remaining_tasks is only set when step has started
  constraint remaining_tasks_state_consistency check (
    remaining_tasks is null or status not in ('created', 'skipped')
  ),
  constraint initial_tasks_known_when_started check (
    status != 'started' or initial_tasks is not null
  ),
  -- Output is only allowed for completed steps (or NULL for steps that haven't completed)
  -- Note: allows status=completed with output=NULL for single steps that return NULL
  constraint output_only_for_completed_or_null check (
    output is null or status = 'completed'
  ),
  -- skip_reason is required for skipped status and forbidden for other statuses
  constraint skip_reason_matches_status check (
    (status = 'skipped' and skip_reason is not null) or
    (status != 'skipped' and skip_reason is null)
  ),
  constraint completed_at_or_failed_at_or_skipped_at check (
    (
      case when completed_at is not null then 1 else 0 end +
      case when failed_at is not null then 1 else 0 end +
      case when skipped_at is not null then 1 else 0 end
    ) <= 1
  ),
  constraint started_at_is_after_created_at check (started_at is null or started_at >= created_at),
  constraint completed_at_is_after_started_at check (completed_at is null or completed_at >= started_at),
  constraint failed_at_is_after_started_at check (failed_at is null or failed_at >= started_at),
  constraint skipped_at_is_after_created_at check (skipped_at is null or skipped_at >= created_at)
);

create index if not exists idx_step_states_ready on pgflow.step_states (run_id, status, remaining_deps) where status
= 'created'
and remaining_deps = 0;
create index if not exists idx_step_states_failed on pgflow.step_states (run_id, step_slug) where status = 'failed';
create index if not exists idx_step_states_skipped on pgflow.step_states (run_id, step_slug) where status = 'skipped';
create index if not exists idx_step_states_flow_slug on pgflow.step_states (flow_slug);
create index if not exists idx_step_states_run_id on pgflow.step_states (run_id);

-- Step tasks table - tracks units of work for step
create table pgflow.step_tasks (
  flow_slug text not null references pgflow.flows(flow_slug),
  run_id uuid not null references pgflow.runs(run_id),
  step_slug text not null,
  message_id bigint,
  task_index int not null default 0,
  status text not null default 'queued',
  queue_name text not null,
  attempts_count int not null default 0,
  error_message text,
  output jsonb,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_worker_id uuid references pgflow.workers(worker_id) on delete set null,
  -- Requeue tracking columns
  requeued_count int not null default 0,
  last_requeued_at timestamptz,
  permanently_stalled_at timestamptz,
  constraint step_tasks_pkey primary key (run_id, step_slug, task_index),
  foreign key (run_id, step_slug)
  references pgflow.step_states(run_id, step_slug),
  constraint valid_status check (
    status in ('queued', 'started', 'completed', 'failed', 'skipped', 'cancelled')
  ),
  constraint output_valid_only_for_completed check (
    output is null or status in ('completed', 'failed')
  ),
  constraint attempts_count_nonnegative check (attempts_count >= 0),
  constraint completed_at_or_failed_at check (not (completed_at is not null and failed_at is not null)),
  constraint completed_at_is_after_queued_at check (completed_at is null or completed_at >= queued_at),
  constraint failed_at_is_after_queued_at check (failed_at is null or failed_at >= queued_at),
  constraint started_at_is_after_queued_at check (started_at is null or started_at >= queued_at),
  constraint completed_at_is_after_started_at check (
    completed_at is null or started_at is null or completed_at >= started_at
  ),
  constraint failed_at_is_after_started_at check (failed_at is null or started_at is null or failed_at >= started_at),
  constraint queue_name_is_valid check (pgflow._is_valid_queue_name(queue_name))
);

-- Queue/message pair identity for queue-scoped PGMQ message IDs. Replaces the
-- former message-only lookups; NULL message IDs stay legal (cleanup paths).
create unique index if not exists idx_step_tasks_queue_message
on pgflow.step_tasks (queue_name, message_id)
where message_id is not null;

-- Task queue snapshots are immutable after insertion. Statement transition
-- tables also reject a task-address move that a key-based comparison would miss.
create or replace function pgflow._keep_task_queue_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select run_id, step_slug, task_index, queue_name from old_tasks
    except
    select run_id, step_slug, task_index, queue_name from new_tasks
  ) then
    raise exception 'step_tasks.queue_name is immutable';
  end if;
  return null;
end;
$$;

create trigger keep_task_queue_name
after update on pgflow.step_tasks
referencing old table as old_tasks new table as new_tasks
for each statement execute function pgflow._keep_task_queue_name();

create index if not exists idx_step_tasks_queued on pgflow.step_tasks (run_id, step_slug) where status = 'queued';
create index if not exists idx_step_tasks_completed on pgflow.step_tasks (run_id, step_slug) where status = 'completed';
create index if not exists idx_step_tasks_failed on pgflow.step_tasks (run_id, step_slug) where status = 'failed';
create index if not exists idx_step_tasks_flow_run_step on pgflow.step_tasks (flow_slug, run_id, step_slug);

-- New indexes for refactored polling behavior
create index if not exists idx_step_tasks_started on pgflow.step_tasks (started_at) where status = 'started';
create index if not exists idx_step_tasks_last_worker on pgflow.step_tasks (last_worker_id) where status = 'started';

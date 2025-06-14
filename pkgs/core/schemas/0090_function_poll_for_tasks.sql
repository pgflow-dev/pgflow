create or replace function pgflow.poll_for_tasks(
  queue_name text,
  vt integer,
  qty integer,
  max_poll_seconds integer default 5,
  poll_interval_ms integer default 100
)
returns setof pgflow.step_task_record
volatile
set search_path to ''
as $$
begin
  -- DEPRECATED: This function is deprecated and will be removed in a future version.
  -- Please update pgflow to use the new two-phase polling approach.
  -- Run 'npx pgflow install' to update your installation.
  raise notice 'DEPRECATED: poll_for_tasks is deprecated and will be removed. Please update pgflow via "npx pgflow install".';
  
  -- Return empty set - no tasks will be processed
  return;
end;
$$ language plpgsql;

/**
 * Helper functions for pruning tests.
 * Contains basic setup code that would otherwise be repeated.
 */

-- Set timestamps for completed runs/steps/tasks to be older than the cutoff
create or replace function pgflow_tests.set_completed_flow_timestamps(
  p_flow_slug text,
  days_old integer
) returns void language plpgsql as $$
begin
  -- Set timestamps for step_tasks
  update pgflow.step_tasks
  set
    queued_at = now() - interval '1 day' - (days_old * interval '1 day'),
    completed_at = now() - (days_old * interval '1 day'),
    status = 'completed'
  where flow_slug = p_flow_slug;
  
  -- Set timestamps for step_states
  update pgflow.step_states
  set
    created_at = now() - interval '2 days' - (days_old * interval '1 day'),
    started_at = now() - interval '1 day' - (days_old * interval '1 day'),
    completed_at = now() - (days_old * interval '1 day'),
    status = 'completed',
    remaining_tasks = 0
  where flow_slug = p_flow_slug;
  
  -- Set timestamps for runs
  update pgflow.runs
  set
    started_at = now() - interval '2 days' - (days_old * interval '1 day'),
    completed_at = now() - (days_old * interval '1 day'),
    status = 'completed',
    remaining_steps = 0
  where flow_slug = p_flow_slug;
end;
$$;

-- Set timestamps for failed runs/steps/tasks to be older than the cutoff
create or replace function pgflow_tests.set_failed_flow_timestamps(
  p_flow_slug text,
  days_old integer
) returns void language plpgsql as $$
begin
  -- Set timestamps for step_tasks
  update pgflow.step_tasks
  set
    queued_at = now() - interval '1 day' - (days_old * interval '1 day'),
    failed_at = now() - (days_old * interval '1 day'),
    status = 'failed',
    error_message = 'Test failure'
  where flow_slug = p_flow_slug;
  
  -- Set timestamps for step_states
  update pgflow.step_states
  set
    created_at = now() - interval '2 days' - (days_old * interval '1 day'),
    started_at = now() - interval '1 day' - (days_old * interval '1 day'),
    failed_at = now() - (days_old * interval '1 day'),
    status = 'failed'
  where flow_slug = p_flow_slug;
  
  -- Set timestamps for runs
  update pgflow.runs
  set
    started_at = now() - interval '2 days' - (days_old * interval '1 day'),
    failed_at = now() - (days_old * interval '1 day'),
    status = 'failed'
  where flow_slug = p_flow_slug;
end;
$$;

-- Set timestamps for running flows to be older than the cutoff
create or replace function pgflow_tests.set_running_flow_timestamps(
  p_flow_slug text,
  days_old integer
) returns void language plpgsql as $$
begin
  -- Set timestamps for step_tasks
  update pgflow.step_tasks
  set
    queued_at = now() - (days_old * interval '1 day'),
    status = 'queued'
  where flow_slug = p_flow_slug;
  
  -- Set timestamps for step_states
  update pgflow.step_states
  set
    created_at = now() - (days_old * interval '1 day'),
    started_at = now() - (days_old * interval '1 day'),
    status = 'started'
  where flow_slug = p_flow_slug;
  
  -- Set timestamps for runs
  update pgflow.runs
  set
    started_at = now() - (days_old * interval '1 day'),
    status = 'started'
  where flow_slug = p_flow_slug;
end;
$$;
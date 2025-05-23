create or replace function pgflow.start_ready_steps(run_id uuid)
returns void
language plpgsql
set search_path to ''
as $$
declare
  fanout_step record;
begin
  -- First, update all ready steps to started status
  with ready_steps as (
    update pgflow.step_states ss
    set 
      status = 'started',
      started_at = clock_timestamp()
    from pgflow.runs r
    where ss.run_id = start_ready_steps.run_id
      and ss.run_id = r.run_id
      and ss.status = 'created'
      and ss.remaining_deps = 0
    returning 
      ss.run_id,
      ss.step_slug, 
      r.flow_slug
  ),
  step_details as (
    -- Get step type for each ready step
    select 
      rs.*,
      s.step_type
    from ready_steps rs
    join pgflow.steps s on s.flow_slug = rs.flow_slug and s.step_slug = rs.step_slug
  ),
  -- Handle single-type steps
  single_tasks as (
    insert into pgflow.step_tasks (
      flow_slug,
      run_id,
      step_slug,
      task_index,
      status,
      attempts_count,
      message_id
    )
    select
      sd.flow_slug,
      sd.run_id,
      sd.step_slug,
      0,
      'queued',
      0,
      pgmq.send('pgflow-tasks', jsonb_build_object(
        'run_id', sd.run_id,
        'flow_slug', sd.flow_slug,
        'step_slug', sd.step_slug,
        'task_index', 0
      ))
    from step_details sd
    where sd.step_type = 'single'
  )
  -- Get fanout steps to process
  select * from step_details where step_type = 'fanout';
  
  -- Handle fanout-type steps
  for fanout_step in
    select rs.run_id, rs.step_slug 
    from ready_steps rs
    join pgflow.steps s on s.flow_slug = rs.flow_slug and s.step_slug = rs.step_slug
    where s.step_type = 'fanout'
  loop
    perform pgflow.spawn_fanout_tasks(fanout_step.run_id, fanout_step.step_slug);
  end loop;
end;
$$;

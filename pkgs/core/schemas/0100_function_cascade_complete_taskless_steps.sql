create or replace function pgflow.cascade_complete_taskless_steps(run_id uuid)
returns int
language plpgsql
set search_path to ''
as $$
declare
  v_total_completed int := 0;
  v_iteration_completed int;
  v_iterations int := 0;
  v_max_iterations int := 50;  -- Safety limit matching worst-case analysis
begin
  loop
    -- Safety counter to prevent infinite loops
    v_iterations := v_iterations + 1;
    if v_iterations > v_max_iterations then
      raise exception 'Cascade loop exceeded safety limit of % iterations', v_max_iterations;
    end if;

    -- Complete all ready taskless steps and update dependencies in one statement
    with completed as (
      update pgflow.step_states
      set status = 'completed',
          started_at = now(),
          completed_at = now(),
          remaining_tasks = 0
      where step_states.run_id = cascade_complete_taskless_steps.run_id
        and status = 'created'
        and remaining_deps = 0
        and initial_tasks = 0
      returning *
    ),
    dep_updates as (
      update pgflow.step_states ss
      set remaining_deps = ss.remaining_deps - dep_counts.completed_deps_count,
          -- For map dependents of taskless steps, set initial_tasks to 0
          initial_tasks = case
            when st.step_type = 'map' then 0
            else ss.initial_tasks
          end
      from (
        -- Count how many dependencies completed for each dependent step
        select
          d.step_slug as dependent_step_slug,
          count(*) as completed_deps_count
        from completed c
        join pgflow.deps d on d.flow_slug = c.flow_slug
                           and d.dep_slug = c.step_slug
        where c.run_id = cascade_complete_taskless_steps.run_id
        group by d.step_slug
      ) dep_counts,
      pgflow.steps st
      where ss.run_id = cascade_complete_taskless_steps.run_id
        and ss.step_slug = dep_counts.dependent_step_slug
        and st.flow_slug = ss.flow_slug
        and st.step_slug = ss.step_slug
    ),
    -- Update runs.remaining_steps
    run_updates as (
      update pgflow.runs r
      set remaining_steps = r.remaining_steps - (
        select count(*) from completed c where c.run_id = r.run_id
      )
      where r.run_id = cascade_complete_taskless_steps.run_id
        and exists (select 1 from completed c where c.run_id = r.run_id)
    ),
    -- Send realtime events for all completed steps
    events_sent as (
      select c.*, realtime.send(
        jsonb_build_object(
          'event_type', 'step:completed',
          'run_id', c.run_id,
          'step_slug', c.step_slug,
          'status', 'completed',
          'started_at', c.started_at,
          'completed_at', c.completed_at,
          'output', '[]'::jsonb
        ),
        concat('step:', c.step_slug, ':completed'),
        concat('pgflow:run:', c.run_id),
        false
      ) as event_id
      from completed c
    )
    select count(*) into v_iteration_completed from events_sent;

    exit when v_iteration_completed = 0;
    v_total_completed := v_total_completed + v_iteration_completed;
  end loop;

  return v_total_completed;
end;
$$;
-- Declarative function to spawn fanout tasks
create or replace function pgflow.spawn_fanout_tasks(
  run_id uuid,
  step_slug text
) 
returns void 
language sql
as $$
with step_info as (
  -- Get step and dependency info
  select 
    s.flow_slug,
    d.dep_slug as dependency_slug,
    ss.run_id as ss_run_id,
    ss.step_slug as ss_step_slug,
    dep_st.output as dependency_output
  from pgflow.runs r
  join pgflow.steps s on s.flow_slug = r.flow_slug and s.step_slug = spawn_fanout_tasks.step_slug
  join pgflow.deps d on d.flow_slug = s.flow_slug and d.step_slug = s.step_slug
  join pgflow.step_states ss on ss.run_id = r.run_id and ss.step_slug = s.step_slug
  join pgflow.step_states dep_ss on dep_ss.run_id = r.run_id and dep_ss.step_slug = d.dep_slug
  join pgflow.step_tasks dep_st on dep_st.run_id = dep_ss.run_id and dep_st.step_slug = dep_ss.step_slug and dep_st.task_index = 0
  where r.run_id = spawn_fanout_tasks.run_id
),
array_validation as (
  -- Validate the dependency output is an array
  select 
    dependency_output as validated_output,
    jsonb_array_length(dependency_output) as array_length,
    ss_run_id,
    ss_step_slug,
    flow_slug
  from step_info
  where jsonb_typeof(dependency_output) = 'array'
    or pgflow.raise_exception(format('Fanout dependency output must be an array, got %s', jsonb_typeof(dependency_output))) is null
),
task_indices as (
  -- Generate task indices
  select generate_series(0, av.array_length - 1) as task_index
  from array_validation av
),
inserted_tasks as (
  -- Insert all tasks in one batch
  insert into pgflow.step_tasks (
    flow_slug,
    run_id,
    step_slug,
    task_index,
    status,
    attempts_count
  )
  select
    av.flow_slug,
    av.ss_run_id,
    av.ss_step_slug,
    ti.task_index,
    'queued',
    0
  from array_validation av
  cross join task_indices ti
  returning task_index
),
-- Update remaining_tasks count
update_state as (
  update pgflow.step_states ss
  set remaining_tasks = av.array_length
  from array_validation av
  where ss.run_id = av.ss_run_id 
    and ss.step_slug = av.ss_step_slug
)
-- Send all messages in one batch
select pgmq.send_batch(
  'pgflow-tasks',
  array(
    select jsonb_build_object(
      'run_id', av.ss_run_id,
      'flow_slug', av.flow_slug,
      'step_slug', av.ss_step_slug,
      'task_index', ti.task_index
    )
    from array_validation av
    cross join task_indices ti
  )
);
$$;
create or replace function pgflow.start_tasks(
  flow_slug text,
  msg_ids bigint [],
  worker_id uuid
)
returns setof pgflow.step_task_record
volatile
set search_path to ''
language sql
as $$
  with tasks as (
    select
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.message_id
    from pgflow.step_tasks as task
    join pgflow.runs r on r.run_id = task.run_id
    where task.flow_slug = start_tasks.flow_slug
      and task.message_id = any(msg_ids)
      and task.status = 'queued'
      -- MVP: Don't start tasks on failed runs
      and r.status != 'failed'
  ),
  start_tasks_update as (
    update pgflow.step_tasks
    set 
      attempts_count = attempts_count + 1,
      status = 'started',
      started_at = now(),
      last_worker_id = worker_id
    from tasks
    where step_tasks.message_id = tasks.message_id
      and step_tasks.flow_slug = tasks.flow_slug
      and step_tasks.status = 'queued'
  ),
  runs as (
    select
      r.run_id,
      r.input
    from pgflow.runs r
    where r.run_id in (select run_id from tasks)
  ),
  deps as (
    select
      st.run_id,
      st.step_slug,
      dep.dep_slug,
      -- Aggregate map outputs or use single output
      CASE
        WHEN dep_step.step_type = 'map' THEN
          -- Aggregate all task outputs ordered by task_index
          -- Use COALESCE to return empty array if no tasks
          (SELECT COALESCE(jsonb_agg(dt.output ORDER BY dt.task_index), '[]'::jsonb)
           FROM pgflow.step_tasks dt
           WHERE dt.run_id = st.run_id
             AND dt.step_slug = dep.dep_slug
             AND dt.status = 'completed')
        ELSE
          -- Single step: use the single task output
          dep_task.output
      END as dep_output
    from tasks st
    join pgflow.deps dep on dep.flow_slug = st.flow_slug and dep.step_slug = st.step_slug
    join pgflow.steps dep_step on dep_step.flow_slug = dep.flow_slug and dep_step.step_slug = dep.dep_slug
    left join pgflow.step_tasks dep_task on
      dep_task.run_id = st.run_id and
      dep_task.step_slug = dep.dep_slug and
      dep_task.status = 'completed'
      and dep_step.step_type = 'single'  -- Only join for single steps
  ),
  deps_outputs as (
    select
      d.run_id,
      d.step_slug,
      jsonb_object_agg(d.dep_slug, d.dep_output) as deps_output,
      count(*) as dep_count
    from deps d
    group by d.run_id, d.step_slug
  ),
  timeouts as (
    select
      task.message_id,
      task.flow_slug,
      coalesce(step.opt_timeout, flow.opt_timeout) + 2 as vt_delay
    from tasks task
    join pgflow.flows flow on flow.flow_slug = task.flow_slug
    join pgflow.steps step on step.flow_slug = task.flow_slug and step.step_slug = task.step_slug
  ),
  -- Batch update visibility timeouts for all messages
  set_vt_batch as (
    select pgflow.set_vt_batch(
      start_tasks.flow_slug,
      array_agg(t.message_id order by t.message_id),
      array_agg(t.vt_delay order by t.message_id)
    )
    from timeouts t
  )
  select
    st.flow_slug,
    st.run_id,
    st.step_slug,
    -- ==========================================
    -- INPUT CONSTRUCTION LOGIC
    -- ==========================================
    -- This nested CASE statement determines how to construct the input
    -- for each task based on the step type (map vs non-map).
    --
    -- The fundamental difference:
    -- - Map steps: Receive RAW array elements (e.g., just 42 or "hello")
    -- - Non-map steps: Receive structured objects with named keys
    --                  (e.g., {"run": {...}, "dependency1": {...}})
    -- ==========================================
    CASE
      -- -------------------- MAP STEPS --------------------
      -- Map steps process arrays element-by-element.
      -- Each task receives ONE element from the array at its task_index position.
      WHEN step.step_type = 'map' THEN
        -- Map steps get raw array elements without any wrapper object
        CASE
          -- ROOT MAP: Gets array from run input
          -- Example: run input = [1, 2, 3]
          --          task 0 gets: 1
          --          task 1 gets: 2
          --          task 2 gets: 3
          WHEN step.deps_count = 0 THEN
            -- Root map (deps_count = 0): no dependencies, reads from run input.
            -- Extract the element at task_index from the run's input array.
            -- Note: If run input is not an array, this will return NULL
            -- and the flow will fail (validated in start_flow).
            jsonb_array_element(r.input, st.task_index)

          -- DEPENDENT MAP: Gets array from its single dependency
          -- Example: dependency output = ["a", "b", "c"]
          --          task 0 gets: "a"
          --          task 1 gets: "b"
          --          task 2 gets: "c"
          ELSE
            -- Has dependencies (should be exactly 1 for map steps).
            -- Extract the element at task_index from the dependency's output array.
            --
            -- Why the subquery with jsonb_each?
            -- - The dependency outputs a raw array: [1, 2, 3]
            -- - deps_outputs aggregates it into: {"dep_name": [1, 2, 3]}
            -- - We need to unwrap and get just the array value
            -- - Map steps have exactly 1 dependency (enforced by add_step)
            -- - So jsonb_each will return exactly 1 row
            -- - We extract the 'value' which is the raw array [1, 2, 3]
            -- - Then get the element at task_index from that array
            (SELECT jsonb_array_element(value, st.task_index)
            FROM jsonb_each(dep_out.deps_output)
            LIMIT 1)
        END

      -- -------------------- NON-MAP STEPS --------------------
      -- Regular (non-map) steps receive ALL inputs as a structured object.
      -- This includes the original run input plus all dependency outputs.
      ELSE
        -- Non-map steps get structured input with named keys
        -- Example output: {
        --   "run": {"original": "input"},
        --   "step1": {"output": "from_step1"},
        --   "step2": {"output": "from_step2"}
        -- }
        --
        -- Build object with 'run' key containing original input
        jsonb_build_object('run', r.input) ||
        -- Merge with deps_output which already has dependency outputs
        -- deps_output format: {"dep1": output1, "dep2": output2, ...}
        -- If no dependencies, defaults to empty object
        coalesce(dep_out.deps_output, '{}'::jsonb)
    END as input,
    st.message_id as msg_id
  from tasks st
  join runs r on st.run_id = r.run_id
  join pgflow.steps step on
    step.flow_slug = st.flow_slug and
    step.step_slug = st.step_slug
  left join deps_outputs dep_out on
    dep_out.run_id = st.run_id and
    dep_out.step_slug = st.step_slug
$$;

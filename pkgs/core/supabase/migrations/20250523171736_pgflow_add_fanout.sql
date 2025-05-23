-- Modify "step_states" table
ALTER TABLE "pgflow"."step_states" ADD COLUMN "output" jsonb NULL;
-- Modify "step_tasks" table
ALTER TABLE "pgflow"."step_tasks" DROP CONSTRAINT "only_single_task_per_step";
-- Modify "steps" table
ALTER TABLE "pgflow"."steps" DROP CONSTRAINT "steps_step_type_check", ADD CONSTRAINT "steps_step_type_check" CHECK (step_type = ANY (ARRAY['single'::text, 'fanout'::text]));
-- Create "add_step" function
CREATE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "deps_slugs" text[], "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer, "step_type" text DEFAULT 'single') RETURNS "pgflow"."steps" LANGUAGE plpgsql SET "search_path" = '' AS $$
begin
  -- Validate fanout constraints
  if step_type = 'fanout' then
    if array_length(deps_slugs, 1) != 1 then
      raise exception 'Fanout steps must have exactly one dependency';
    end if;
    if array_length(deps_slugs, 1) is null then
      raise exception 'Fanout steps cannot be root steps';
    end if;
  end if;

  return (
    WITH
      next_index AS (
        SELECT COALESCE(MAX(step_index) + 1, 0) as idx
        FROM pgflow.steps
        WHERE flow_slug = add_step.flow_slug
      ),
      create_step AS (
        INSERT INTO pgflow.steps (flow_slug, step_slug, step_index, deps_count, opt_max_attempts, opt_base_delay, opt_timeout, step_type)
        SELECT add_step.flow_slug, add_step.step_slug, idx, COALESCE(array_length(deps_slugs, 1), 0), max_attempts, base_delay, timeout, add_step.step_type
        FROM next_index
        ON CONFLICT (flow_slug, step_slug)
        DO UPDATE SET step_slug = pgflow.steps.step_slug
        RETURNING *
      ),
      insert_deps AS (
        INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
        SELECT add_step.flow_slug, d.dep_slug, add_step.step_slug
        FROM unnest(deps_slugs) AS d(dep_slug)
        ON CONFLICT (flow_slug, dep_slug, step_slug) DO NOTHING
        RETURNING 1
      )
    -- Return the created step
    SELECT * FROM create_step
  );
end;
$$;
-- Modify "add_step" function
CREATE OR REPLACE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer) RETURNS "pgflow"."steps" LANGUAGE sql SET "search_path" = '' AS $$
-- Call the original function with an empty array and default step_type
    SELECT * FROM pgflow.add_step(flow_slug, step_slug, ARRAY[]::text[], max_attempts, base_delay, timeout, 'single');
$$;
-- Modify "maybe_complete_run" function
CREATE OR REPLACE FUNCTION "pgflow"."maybe_complete_run" ("run_id" uuid) RETURNS void LANGUAGE sql SET "search_path" = '' AS $$
-- Update run status to completed and set output when there are no remaining steps
  -- All done in a single declarative SQL statement
  UPDATE pgflow.runs
  SET
    status = 'completed',
    completed_at = now(),
    output = (
      -- Get outputs from final steps (steps that are not dependencies for other steps)
      SELECT jsonb_object_agg(ss.step_slug, 
        CASE 
          WHEN s.step_type = 'fanout' THEN ss.output  -- For fanout, use aggregated output from step_states
          ELSE st.output  -- For single, use task output
        END
      )
      FROM pgflow.step_states ss
      JOIN pgflow.steps s ON s.flow_slug = ss.flow_slug AND s.step_slug = ss.step_slug
      LEFT JOIN pgflow.step_tasks st ON st.run_id = ss.run_id AND st.step_slug = ss.step_slug AND st.task_index = 0
      WHERE ss.run_id = maybe_complete_run.run_id
        AND ss.status = 'completed'
        AND NOT EXISTS (
          SELECT 1
          FROM pgflow.deps d
          WHERE d.flow_slug = ss.flow_slug
            AND d.dep_slug = ss.step_slug
        )
    )
  WHERE pgflow.runs.run_id = maybe_complete_run.run_id
    AND pgflow.runs.remaining_steps = 0
    AND pgflow.runs.status != 'completed';
$$;
-- Create "raise_exception" function
CREATE FUNCTION "pgflow"."raise_exception" ("message" text) RETURNS void LANGUAGE plpgsql AS $$
begin
  raise exception '%', message;
end;
$$;
-- Create "spawn_fanout_tasks" function
CREATE FUNCTION "pgflow"."spawn_fanout_tasks" ("run_id" uuid, "step_slug" text) RETURNS void LANGUAGE sql AS $$
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
-- Modify "start_ready_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."start_ready_steps" ("run_id" uuid) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
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
-- Modify "complete_task" function
CREATE OR REPLACE FUNCTION "pgflow"."complete_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
begin

WITH run_lock AS (
  SELECT * FROM pgflow.runs
  WHERE pgflow.runs.run_id = complete_task.run_id
  FOR UPDATE
),
step_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug
  FOR UPDATE
),
task AS (
  UPDATE pgflow.step_tasks
  SET
    status = 'completed',
    completed_at = now(),
    output = complete_task.output
  WHERE pgflow.step_tasks.run_id = complete_task.run_id
    AND pgflow.step_tasks.step_slug = complete_task.step_slug
    AND pgflow.step_tasks.task_index = complete_task.task_index
  RETURNING *
),
step_state AS (
  UPDATE pgflow.step_states
  SET
    status = CASE
    WHEN pgflow.step_states.remaining_tasks = 1 THEN 'completed'  -- Will be 0 after decrement
    ELSE 'started'
    END,
    completed_at = CASE
    WHEN pgflow.step_states.remaining_tasks = 1 THEN now()  -- Will be 0 after decrement
    ELSE NULL
    END,
    remaining_tasks = pgflow.step_states.remaining_tasks - 1
  FROM task
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug
  RETURNING pgflow.step_states.*
),
-- For fanout steps that just completed all tasks, aggregate outputs
fanout_aggregation AS (
  UPDATE pgflow.step_states ss
  SET output = (
    SELECT jsonb_agg(st.output ORDER BY st.task_index)
    FROM pgflow.step_tasks st
    WHERE st.run_id = ss.run_id
      AND st.step_slug = ss.step_slug
      AND st.status = 'completed'
  )
  FROM step_state s
  JOIN pgflow.steps step ON step.flow_slug = s.flow_slug AND step.step_slug = s.step_slug
  WHERE ss.run_id = s.run_id
    AND ss.step_slug = s.step_slug
    AND s.status = 'completed'
    AND step.step_type = 'fanout'
),
-- Find all dependent steps if the current step was completed
dependent_steps AS (
  SELECT d.step_slug AS dependent_step_slug
  FROM pgflow.deps d
  JOIN step_state s ON s.status = 'completed' AND d.flow_slug = s.flow_slug
  WHERE d.dep_slug = complete_task.step_slug
  ORDER BY d.step_slug  -- Ensure consistent ordering
),
-- Lock dependent steps before updating
dependent_steps_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug IN (SELECT dependent_step_slug FROM dependent_steps)
  FOR UPDATE
),
-- Update all dependent steps
dependent_steps_update AS (
  UPDATE pgflow.step_states
  SET remaining_deps = pgflow.step_states.remaining_deps - 1
  FROM dependent_steps
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = dependent_steps.dependent_step_slug
)
-- Only decrement remaining_steps, don't update status
UPDATE pgflow.runs
SET remaining_steps = pgflow.runs.remaining_steps - 1
FROM step_state
WHERE pgflow.runs.run_id = complete_task.run_id
  AND step_state.status = 'completed';

PERFORM pgmq.archive(
  queue_name => (SELECT run.flow_slug FROM pgflow.runs AS run WHERE run.run_id = complete_task.run_id),
  msg_id => (SELECT message_id FROM pgflow.step_tasks AS step_task
             WHERE step_task.run_id = complete_task.run_id
             AND step_task.step_slug = complete_task.step_slug
             AND step_task.task_index = complete_task.task_index)
);

PERFORM pgflow.start_ready_steps(complete_task.run_id);

PERFORM pgflow.maybe_complete_run(complete_task.run_id);

RETURN QUERY SELECT *
FROM pgflow.step_tasks AS step_task
WHERE step_task.run_id = complete_task.run_id
  AND step_task.step_slug = complete_task.step_slug
  AND step_task.task_index = complete_task.task_index;

end;
$$;
-- Modify "poll_for_tasks" function
CREATE OR REPLACE FUNCTION "pgflow"."poll_for_tasks" ("queue_name" text, "vt" integer, "qty" integer, "max_poll_seconds" integer DEFAULT 5, "poll_interval_ms" integer DEFAULT 100) RETURNS SETOF "pgflow"."step_task_record" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  msg_ids bigint[];
begin
  -- First statement: Read messages and capture their IDs
  -- This gets its own snapshot and can see newly committed messages
  select array_agg(msg_id)
  into msg_ids
  from pgflow.read_with_poll(
    queue_name,
    vt,
    qty,
    max_poll_seconds,
    poll_interval_ms
  );

  -- If no messages were read, return empty set
  if msg_ids is null or array_length(msg_ids, 1) is null then
    return;
  end if;

  -- Second statement: Process tasks with fresh snapshot
  -- This can now see step_tasks that were committed during the poll
  return query
  with tasks as (
    select
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.message_id,
      step.step_type,
      -- For fanout steps, get the single dependency slug
      case 
        when step.step_type = 'fanout' then 
          (select d.dep_slug from pgflow.deps d where d.flow_slug = task.flow_slug and d.step_slug = task.step_slug limit 1)
        else null
      end as fanout_dep_slug
    from pgflow.step_tasks as task
    join pgflow.steps step on step.flow_slug = task.flow_slug and step.step_slug = task.step_slug
    where task.message_id = any(msg_ids)
      and task.status = 'queued'
  ),
  increment_attempts as (
    update pgflow.step_tasks
    set attempts_count = attempts_count + 1
    from tasks
    where step_tasks.message_id = tasks.message_id
    and status = 'queued'
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
      dep_task.output as dep_output
    from tasks st
    join pgflow.deps dep on dep.flow_slug = st.flow_slug and dep.step_slug = st.step_slug
    join pgflow.step_tasks dep_task on
      dep_task.run_id = st.run_id and
      dep_task.step_slug = dep.dep_slug and
      dep_task.status = 'completed'
  ),
  deps_outputs as (
    select
      d.run_id,
      d.step_slug,
      jsonb_object_agg(d.dep_slug, d.dep_output) as deps_output
    from deps d
    group by d.run_id, d.step_slug
  ),
  timeouts as (
    select
      task.message_id,
      coalesce(step.opt_timeout, flow.opt_timeout) + 2 as vt_delay
    from tasks task
    join pgflow.flows flow on flow.flow_slug = task.flow_slug
    join pgflow.steps step on step.flow_slug = task.flow_slug and step.step_slug = task.step_slug
  )
  select
    st.flow_slug,
    st.run_id,
    st.step_slug,
    case 
      when st.step_type = 'fanout' then
        -- For fanout: only send the specific array item
        jsonb_build_object(
          'item', 
          (dep_out.deps_output -> st.fanout_dep_slug) -> st.task_index
        )
      else
        -- For single: current behavior
        jsonb_build_object('run', r.input) ||
        coalesce(dep_out.deps_output, '{}'::jsonb)
    end as input,
    st.message_id as msg_id
  from tasks st
  join runs r on st.run_id = r.run_id
  left join deps_outputs dep_out on
    dep_out.run_id = st.run_id and
    dep_out.step_slug = st.step_slug
  cross join lateral (
    -- TODO: this is slow because it calls set_vt for each row, and set_vt
    --       builds dynamic query from string every time it is called
    --       implement set_vt_batch(msgs_ids bigint[], vt_delays int[])
    select pgmq.set_vt(queue_name, st.message_id,
      (select t.vt_delay from timeouts t where t.message_id = st.message_id)
    )
  ) set_vt;
end;
$$;
-- Drop "add_step" function
DROP FUNCTION "pgflow"."add_step" (text, text, text[], integer, integer, integer);

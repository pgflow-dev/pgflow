-- Create index "idx_workers_heartbeat" to table: "workers"
create index "idx_workers_heartbeat" on "pgflow"."workers" ("last_heartbeat_at");
-- Modify "step_tasks" table
alter table "pgflow"."step_tasks" drop constraint "valid_status",
add constraint "valid_status" check (
  status = ANY(array['queued'::text, 'started'::text, 'completed'::text, 'failed'::text])
),
add constraint "completed_at_is_after_started_at" check (
  (completed_at is null) or (started_at is null) or (completed_at >= started_at)
),
add constraint "failed_at_is_after_started_at" check (
  (failed_at is null) or (started_at is null) or (failed_at >= started_at)
),
add constraint "started_at_is_after_queued_at" check ((started_at is null) or (started_at >= queued_at)),
add column "started_at" timestamptz null,
add column "last_worker_id" uuid null,
add constraint "step_tasks_last_worker_id_fkey" foreign key ("last_worker_id") references "pgflow"."workers" (
  "worker_id"
) on update no action on delete set null;
-- Create index "idx_step_tasks_last_worker" to table: "step_tasks"
create index "idx_step_tasks_last_worker" on "pgflow"."step_tasks" ("last_worker_id") where (status = 'started'::text);
-- Create index "idx_step_tasks_queued_msg" to table: "step_tasks"
create index "idx_step_tasks_queued_msg" on "pgflow"."step_tasks" ("message_id") where (status = 'queued'::text);
-- Create index "idx_step_tasks_started" to table: "step_tasks"
create index "idx_step_tasks_started" on "pgflow"."step_tasks" ("started_at") where (status = 'started'::text);
-- Modify "complete_task" function
create or replace function "pgflow"."complete_task"(
  "run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb
) returns setof "pgflow"."step_tasks" language plpgsql set "search_path"
= '' as $$
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
    AND pgflow.step_tasks.status = 'started'
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

-- For completed tasks: archive the message
PERFORM (
  WITH completed_tasks AS (
    SELECT r.flow_slug, st.message_id
    FROM pgflow.step_tasks st
    JOIN pgflow.runs r ON st.run_id = r.run_id
    WHERE st.run_id = complete_task.run_id
      AND st.step_slug = complete_task.step_slug
      AND st.task_index = complete_task.task_index
      AND st.status = 'completed'
  )
  SELECT pgmq.archive(ct.flow_slug, ct.message_id)
  FROM completed_tasks ct
  WHERE EXISTS (SELECT 1 FROM completed_tasks)
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
-- Modify "fail_task" function
create or replace function "pgflow"."fail_task"(
  "run_id" uuid, "step_slug" text, "task_index" integer, "error_message" text
) returns setof "pgflow"."step_tasks" language plpgsql set "search_path"
= '' as $$
begin

WITH run_lock AS (
  SELECT * FROM pgflow.runs
  WHERE pgflow.runs.run_id = fail_task.run_id
  FOR UPDATE
),
step_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  FOR UPDATE
),
flow_info AS (
  SELECT r.flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = fail_task.run_id
),
config AS (
  SELECT
    COALESCE(s.opt_max_attempts, f.opt_max_attempts) AS opt_max_attempts,
    COALESCE(s.opt_base_delay, f.opt_base_delay) AS opt_base_delay
  FROM pgflow.steps s
  JOIN pgflow.flows f ON f.flow_slug = s.flow_slug
  JOIN flow_info fi ON fi.flow_slug = s.flow_slug
  WHERE s.flow_slug = fi.flow_slug AND s.step_slug = fail_task.step_slug
),

fail_or_retry_task as (
  UPDATE pgflow.step_tasks as task
  SET
    status = CASE
      WHEN task.attempts_count < (SELECT opt_max_attempts FROM config) THEN 'queued'
      ELSE 'failed'
    END,
    failed_at = CASE
      WHEN task.attempts_count >= (SELECT opt_max_attempts FROM config) THEN now()
      ELSE NULL
    END,
    started_at = CASE
      WHEN task.attempts_count < (SELECT opt_max_attempts FROM config) THEN NULL
      ELSE task.started_at
    END,
    error_message = fail_task.error_message
  WHERE task.run_id = fail_task.run_id
    AND task.step_slug = fail_task.step_slug
    AND task.task_index = fail_task.task_index
    AND task.status = 'started'
  RETURNING *
),
maybe_fail_step AS (
  UPDATE pgflow.step_states
  SET
    status = CASE
             WHEN (select fail_or_retry_task.status from fail_or_retry_task) = 'failed' THEN 'failed'
             ELSE pgflow.step_states.status
             END,
    failed_at = CASE
                WHEN (select fail_or_retry_task.status from fail_or_retry_task) = 'failed' THEN now()
                ELSE NULL
                END
  FROM fail_or_retry_task
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  RETURNING pgflow.step_states.*
)
UPDATE pgflow.runs
SET status = CASE
              WHEN (select status from maybe_fail_step) = 'failed' THEN 'failed'
              ELSE status
              END,
    failed_at = CASE
                WHEN (select status from maybe_fail_step) = 'failed' THEN now()
                ELSE NULL
                END
WHERE pgflow.runs.run_id = fail_task.run_id;

-- For queued tasks: delay the message for retry with exponential backoff
PERFORM (
  WITH retry_config AS (
    SELECT
      COALESCE(s.opt_base_delay, f.opt_base_delay) AS base_delay
    FROM pgflow.steps s
    JOIN pgflow.flows f ON f.flow_slug = s.flow_slug
    JOIN pgflow.runs r ON r.flow_slug = f.flow_slug
    WHERE r.run_id = fail_task.run_id
      AND s.step_slug = fail_task.step_slug
  ),
  queued_tasks AS (
    SELECT
      r.flow_slug,
      st.message_id,
      pgflow.calculate_retry_delay((SELECT base_delay FROM retry_config), st.attempts_count) AS calculated_delay
    FROM pgflow.step_tasks st
    JOIN pgflow.runs r ON st.run_id = r.run_id
    WHERE st.run_id = fail_task.run_id
      AND st.step_slug = fail_task.step_slug
      AND st.task_index = fail_task.task_index
      AND st.status = 'queued'
  )
  SELECT pgmq.set_vt(qt.flow_slug, qt.message_id, qt.calculated_delay)
  FROM queued_tasks qt
  WHERE EXISTS (SELECT 1 FROM queued_tasks)
);

-- For failed tasks: archive the message
PERFORM (
  WITH failed_tasks AS (
    SELECT r.flow_slug, st.message_id
    FROM pgflow.step_tasks st
    JOIN pgflow.runs r ON st.run_id = r.run_id
    WHERE st.run_id = fail_task.run_id
      AND st.step_slug = fail_task.step_slug
      AND st.task_index = fail_task.task_index
      AND st.status = 'failed'
  )
  SELECT pgmq.archive(ft.flow_slug, ft.message_id)
  FROM failed_tasks ft
  WHERE EXISTS (SELECT 1 FROM failed_tasks)
);

return query select *
from pgflow.step_tasks st
where st.run_id = fail_task.run_id
  and st.step_slug = fail_task.step_slug
  and st.task_index = fail_task.task_index;

end;
$$;
-- Modify "poll_for_tasks" function
create or replace function "pgflow"."poll_for_tasks"(
  "queue_name" text,
  "vt" integer,
  "qty" integer,
  "max_poll_seconds" integer default 5,
  "poll_interval_ms" integer default 100
) returns setof "pgflow"."step_task_record" language plpgsql set "search_path"
= '' as $$
begin
  -- DEPRECATED: This function is deprecated and will be removed in a future version.
  -- Please update pgflow to use the new two-phase polling approach.
  -- Run 'npx pgflow install' to update your installation.
  raise notice 'DEPRECATED: poll_for_tasks is deprecated and will be removed. Please update pgflow via "npx pgflow install".';

  -- Return empty set - no tasks will be processed
  return;
end;
$$;
-- Create "start_tasks" function
create function "pgflow"."start_tasks"(
  "flow_slug" text, "msg_ids" bigint [], "worker_id" uuid
) returns setof "pgflow"."step_task_record" language sql set "search_path"
= '' as $$
with tasks as (
    select
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.message_id
    from pgflow.step_tasks as task
    where task.flow_slug = start_tasks.flow_slug
      and task.message_id = any(msg_ids)
      and task.status = 'queued'
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
      task.flow_slug,
      coalesce(step.opt_timeout, flow.opt_timeout) + 2 as vt_delay
    from tasks task
    join pgflow.flows flow on flow.flow_slug = task.flow_slug
    join pgflow.steps step on step.flow_slug = task.flow_slug and step.step_slug = task.step_slug
  )
  select
    st.flow_slug,
    st.run_id,
    st.step_slug,
    jsonb_build_object('run', r.input) ||
    coalesce(dep_out.deps_output, '{}'::jsonb) as input,
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
    select pgmq.set_vt(t.flow_slug, st.message_id, t.vt_delay)
    from timeouts t
    where t.message_id = st.message_id
      and t.flow_slug = st.flow_slug
  ) set_vt
$$;

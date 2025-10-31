-- Modify "step_states" table
ALTER TABLE "pgflow"."step_states" ADD COLUMN "error_message" text NULL;
-- Create index "idx_step_states_run_id" to table: "step_states"
CREATE INDEX "idx_step_states_run_id" ON "pgflow"."step_states" ("run_id");
-- Modify "maybe_complete_run" function
CREATE OR REPLACE FUNCTION "pgflow"."maybe_complete_run" ("run_id" uuid) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_completed_run pgflow.runs%ROWTYPE;
begin
  -- Update run status to completed and set output when there are no remaining steps
  WITH run_output AS (
    -- Get outputs from final steps (steps that are not dependencies for other steps)
    SELECT jsonb_object_agg(st.step_slug, st.output) as final_output
    FROM pgflow.step_tasks st
    JOIN pgflow.step_states ss ON ss.run_id = st.run_id AND ss.step_slug = st.step_slug
    JOIN pgflow.runs r ON r.run_id = ss.run_id AND r.flow_slug = ss.flow_slug
    WHERE st.run_id = maybe_complete_run.run_id
      AND st.status = 'completed'
      AND NOT EXISTS (
        SELECT 1
        FROM pgflow.deps d
        WHERE d.flow_slug = ss.flow_slug
          AND d.dep_slug = ss.step_slug
      )
  )
  UPDATE pgflow.runs
  SET
    status = 'completed',
    completed_at = now(),
    output = (SELECT final_output FROM run_output)
  WHERE pgflow.runs.run_id = maybe_complete_run.run_id
    AND pgflow.runs.remaining_steps = 0
    AND pgflow.runs.status != 'completed'
  RETURNING * INTO v_completed_run;

  -- Only send broadcast if run was completed
  IF v_completed_run.run_id IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'event_type', 'run:completed',
        'run_id', v_completed_run.run_id,
        'flow_slug', v_completed_run.flow_slug,
        'status', 'completed',
        'output', v_completed_run.output,
        'completed_at', v_completed_run.completed_at
      ),
      'run:completed',
      concat('pgflow:run:', v_completed_run.run_id),
      false
    );
  END IF;
end;
$$;
-- Modify "start_ready_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."start_ready_steps" ("run_id" uuid) RETURNS void LANGUAGE sql SET "search_path" = '' AS $$
WITH ready_steps AS (
  SELECT *
  FROM pgflow.step_states AS step_state
  WHERE step_state.run_id = start_ready_steps.run_id
    AND step_state.status = 'created'
    AND step_state.remaining_deps = 0
  ORDER BY step_state.step_slug
  FOR UPDATE
),
started_step_states AS (
  UPDATE pgflow.step_states
  SET status = 'started',
      started_at = now()
  FROM ready_steps
  WHERE pgflow.step_states.run_id = start_ready_steps.run_id
    AND pgflow.step_states.step_slug = ready_steps.step_slug
  RETURNING pgflow.step_states.*
),
sent_messages AS (
  SELECT
    started_step.flow_slug,
    started_step.run_id,
    started_step.step_slug,
    pgmq.send(started_step.flow_slug, jsonb_build_object(
      'flow_slug', started_step.flow_slug,
      'run_id', started_step.run_id,
      'step_slug', started_step.step_slug,
      'task_index', 0
    )) AS msg_id
  FROM started_step_states AS started_step
),
broadcast_events AS (
  SELECT 
    realtime.send(
      jsonb_build_object(
        'event_type', 'step:started',
        'run_id', started_step.run_id,
        'step_slug', started_step.step_slug,
        'status', 'started',
        'started_at', started_step.started_at,
        'remaining_tasks', 1,
        'remaining_deps', started_step.remaining_deps
      ),
      concat('step:', started_step.step_slug, ':started'),
      concat('pgflow:run:', started_step.run_id),
      false
    )
  FROM started_step_states AS started_step
)
INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, message_id)
SELECT
  sent_messages.flow_slug,
  sent_messages.run_id,
  sent_messages.step_slug,
  sent_messages.msg_id
FROM sent_messages;
$$;
-- Modify "complete_task" function
CREATE OR REPLACE FUNCTION "pgflow"."complete_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_step_state pgflow.step_states%ROWTYPE;
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

-- Get the updated step state for broadcasting
SELECT * INTO v_step_state FROM pgflow.step_states
WHERE pgflow.step_states.run_id = complete_task.run_id AND pgflow.step_states.step_slug = complete_task.step_slug;

-- Send broadcast event for step completed if the step is completed
IF v_step_state.status = 'completed' THEN
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:completed',
      'run_id', complete_task.run_id,
      'step_slug', complete_task.step_slug,
      'status', 'completed',
      'output', complete_task.output,
      'completed_at', v_step_state.completed_at
    ),
    concat('step:', complete_task.step_slug, ':completed'),
    concat('pgflow:run:', complete_task.run_id),
    false
  );
END IF;

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
CREATE OR REPLACE FUNCTION "pgflow"."fail_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "error_message" text) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_run_failed boolean;
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
                END,
    error_message = CASE
                    WHEN (select fail_or_retry_task.status from fail_or_retry_task) = 'failed' THEN fail_task.error_message
                    ELSE NULL
                    END
  FROM fail_or_retry_task
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  RETURNING pgflow.step_states.*
),
-- Send broadcast event for step failed if necessary
broadcast_step_failed AS (
  SELECT
    realtime.send(
      jsonb_build_object(
        'event_type', 'step:failed',
        'run_id', fail_task.run_id,
        'step_slug', fail_task.step_slug,
        'status', 'failed',
        'error_message', fail_task.error_message,
        'failed_at', now()
      ),
      concat('step:', fail_task.step_slug, ':failed'),
      concat('pgflow:run:', fail_task.run_id),
      false
    )
  FROM maybe_fail_step
  WHERE maybe_fail_step.status = 'failed'
)
-- Only decrement remaining_steps, don't update status
UPDATE pgflow.runs
SET status = CASE
              WHEN (select status from maybe_fail_step) = 'failed' THEN 'failed'
              ELSE status
              END,
    failed_at = CASE
                WHEN (select status from maybe_fail_step) = 'failed' THEN now()
                ELSE NULL
                END
WHERE pgflow.runs.run_id = fail_task.run_id
RETURNING (status = 'failed') INTO v_run_failed;

-- Send broadcast event for run failure if the run was failed
IF v_run_failed THEN
  DECLARE
    v_flow_slug text;
  BEGIN
    SELECT flow_slug INTO v_flow_slug FROM pgflow.runs WHERE pgflow.runs.run_id = fail_task.run_id;

    PERFORM realtime.send(
      jsonb_build_object(
        'event_type', 'run:failed',
        'run_id', fail_task.run_id,
        'flow_slug', v_flow_slug,
        'status', 'failed',
        'error_message', fail_task.error_message,
        'failed_at', now()
      ),
      'run:failed',
      concat('pgflow:run:', fail_task.run_id),
      false
    );
  END;
END IF;

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
-- Create "get_run_with_states" function
CREATE FUNCTION "pgflow"."get_run_with_states" ("run_id" uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
SELECT jsonb_build_object(
    'run', to_jsonb(r),
    'steps', COALESCE(jsonb_agg(to_jsonb(s)) FILTER (WHERE s.run_id IS NOT NULL), '[]'::jsonb)
  )
  FROM pgflow.runs r
  LEFT JOIN pgflow.step_states s ON s.run_id = r.run_id
  WHERE r.run_id = get_run_with_states.run_id
  GROUP BY r.run_id;
$$;
-- Create "start_flow" function
CREATE FUNCTION "pgflow"."start_flow" ("flow_slug" text, "input" jsonb, "run_id" uuid DEFAULT NULL::uuid) RETURNS SETOF "pgflow"."runs" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_created_run pgflow.runs%ROWTYPE;
begin

WITH
  flow_steps AS (
    SELECT steps.flow_slug, steps.step_slug, steps.deps_count
    FROM pgflow.steps
    WHERE steps.flow_slug = start_flow.flow_slug
  ),
  created_run AS (
    INSERT INTO pgflow.runs (run_id, flow_slug, input, remaining_steps)
    VALUES (
      COALESCE(start_flow.run_id, gen_random_uuid()),
      start_flow.flow_slug,
      start_flow.input,
      (SELECT count(*) FROM flow_steps)
    )
    RETURNING *
  ),
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, remaining_deps)
    SELECT
      fs.flow_slug,
      (SELECT created_run.run_id FROM created_run),
      fs.step_slug,
      fs.deps_count
    FROM flow_steps fs
  )
SELECT * FROM created_run INTO v_created_run;

-- Send broadcast event for run started
PERFORM realtime.send(
  jsonb_build_object(
    'event_type', 'run:started',
    'run_id', v_created_run.run_id,
    'flow_slug', v_created_run.flow_slug,
    'input', v_created_run.input,
    'status', 'started',
    'remaining_steps', v_created_run.remaining_steps,
    'started_at', v_created_run.started_at
  ),
  'run:started',
  concat('pgflow:run:', v_created_run.run_id),
  false
);

PERFORM pgflow.start_ready_steps(v_created_run.run_id);

RETURN QUERY SELECT * FROM pgflow.runs where pgflow.runs.run_id = v_created_run.run_id;

end;
$$;
-- Create "start_flow_with_states" function
CREATE FUNCTION "pgflow"."start_flow_with_states" ("flow_slug" text, "input" jsonb, "run_id" uuid DEFAULT NULL::uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_run_id UUID;
BEGIN
  -- Start the flow using existing function
  SELECT r.run_id INTO v_run_id FROM pgflow.start_flow(
    start_flow_with_states.flow_slug,
    start_flow_with_states.input,
    start_flow_with_states.run_id
  ) AS r LIMIT 1;

  -- Use get_run_with_states to return the complete state
  RETURN pgflow.get_run_with_states(v_run_id);
END;
$$;
-- Drop "start_flow" function
DROP FUNCTION "pgflow"."start_flow" (text, jsonb);

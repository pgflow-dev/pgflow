-- Modify "steps" table
ALTER TABLE "pgflow"."steps" ADD CONSTRAINT "opt_start_delay_is_nonnegative" CHECK ((opt_start_delay IS NULL) OR (opt_start_delay >= 0)), ADD COLUMN "opt_start_delay" integer NULL;
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
    pgmq.send(
      started_step.flow_slug, 
      jsonb_build_object(
        'flow_slug', started_step.flow_slug,
        'run_id', started_step.run_id,
        'step_slug', started_step.step_slug,
        'task_index', 0
      ),
      COALESCE(step.opt_start_delay, 0)
    ) AS msg_id
  FROM started_step_states AS started_step
  JOIN pgflow.steps AS step 
    ON step.flow_slug = started_step.flow_slug 
    AND step.step_slug = started_step.step_slug
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
-- Create "add_step" function
CREATE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "deps_slugs" text[], "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer, "start_delay" integer DEFAULT NULL::integer) RETURNS "pgflow"."steps" LANGUAGE sql SET "search_path" = '' AS $$
WITH
  next_index AS (
    SELECT COALESCE(MAX(step_index) + 1, 0) as idx
    FROM pgflow.steps
    WHERE flow_slug = add_step.flow_slug
  ),
  create_step AS (
    INSERT INTO pgflow.steps (flow_slug, step_slug, step_index, deps_count, opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay)
    SELECT add_step.flow_slug, add_step.step_slug, idx, COALESCE(array_length(deps_slugs, 1), 0), max_attempts, base_delay, timeout, start_delay
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
SELECT * FROM create_step;
$$;
-- Drop "add_step" function
DROP FUNCTION "pgflow"."add_step" (text, text, integer, integer, integer);
-- Drop "add_step" function
DROP FUNCTION "pgflow"."add_step" (text, text, text[], integer, integer, integer);
-- Create "add_step" function
CREATE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer, "start_delay" integer DEFAULT NULL::integer) RETURNS "pgflow"."steps" LANGUAGE sql SET "search_path" = '' AS $$
-- Call the original function with an empty array
    SELECT * FROM pgflow.add_step(flow_slug, step_slug, ARRAY[]::text[], max_attempts, base_delay, timeout, start_delay);
$$;

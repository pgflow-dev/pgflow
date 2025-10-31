-- Add new schema named "pgflow"
CREATE SCHEMA "pgflow";
-- Add new schema named "pgmq"
CREATE SCHEMA IF NOT EXISTS "pgmq";
-- Create extension "pgmq"
CREATE EXTENSION IF NOT EXISTS "pgmq" WITH SCHEMA "pgmq";
-- Create "read_with_poll" function
CREATE FUNCTION "pgflow"."read_with_poll" ("queue_name" text, "vt" integer, "qty" integer, "max_poll_seconds" integer DEFAULT 5, "poll_interval_ms" integer DEFAULT 100, "conditional" jsonb DEFAULT '{}') RETURNS SETOF pgmq.message_record LANGUAGE plpgsql AS $$
DECLARE
    r pgmq.message_record;
    stop_at TIMESTAMP;
    sql TEXT;
    qtable TEXT := pgmq.format_table_name(queue_name, 'q');
BEGIN
    stop_at := clock_timestamp() + make_interval(secs => max_poll_seconds);
    LOOP
      IF (SELECT clock_timestamp() >= stop_at) THEN
        RETURN;
      END IF;

      sql := FORMAT(
          $QUERY$
          WITH cte AS
          (
              SELECT msg_id
              FROM pgmq.%I
              WHERE vt <= clock_timestamp() AND CASE
                  WHEN %L != '{}'::jsonb THEN (message @> %2$L)::integer
                  ELSE 1
              END = 1
              ORDER BY msg_id ASC
              LIMIT $1
              FOR UPDATE SKIP LOCKED
          )
          UPDATE pgmq.%I m
          SET
              vt = clock_timestamp() + %L,
              read_ct = read_ct + 1
          FROM cte
          WHERE m.msg_id = cte.msg_id
          RETURNING m.msg_id, m.read_ct, m.enqueued_at, m.vt, m.message;
          $QUERY$,
          qtable, conditional, qtable, make_interval(secs => vt)
      );

      FOR r IN
        EXECUTE sql USING qty
      LOOP
        RETURN NEXT r;
      END LOOP;
      IF FOUND THEN
        RETURN;
      ELSE
        PERFORM pg_sleep(poll_interval_ms::numeric / 1000);
      END IF;
    END LOOP;
END;
$$;
-- Create composite type "step_task_record"
CREATE TYPE "pgflow"."step_task_record" AS ("flow_slug" text, "run_id" uuid, "step_slug" text, "input" jsonb, "msg_id" bigint);
-- Create "is_valid_slug" function
CREATE FUNCTION "pgflow"."is_valid_slug" ("slug" text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
begin
    return
      slug is not null
      and slug <> ''
      and length(slug) <= 128
      and slug ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
      and slug NOT IN ('run'); -- reserved words
end;
$$;
-- Create "flows" table
CREATE TABLE "pgflow"."flows" ("flow_slug" text NOT NULL, "opt_max_attempts" integer NOT NULL DEFAULT 3, "opt_base_delay" integer NOT NULL DEFAULT 1, "opt_timeout" integer NOT NULL DEFAULT 60, "created_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("flow_slug"), CONSTRAINT "opt_base_delay_is_nonnegative" CHECK (opt_base_delay >= 0), CONSTRAINT "opt_max_attempts_is_nonnegative" CHECK (opt_max_attempts >= 0), CONSTRAINT "opt_timeout_is_positive" CHECK (opt_timeout > 0), CONSTRAINT "slug_is_valid" CHECK (pgflow.is_valid_slug(flow_slug)));
-- Create "steps" table
CREATE TABLE "pgflow"."steps" ("flow_slug" text NOT NULL, "step_slug" text NOT NULL, "step_type" text NOT NULL DEFAULT 'single', "step_index" integer NOT NULL DEFAULT 0, "deps_count" integer NOT NULL DEFAULT 0, "opt_max_attempts" integer NULL, "opt_base_delay" integer NULL, "opt_timeout" integer NULL, "created_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("flow_slug", "step_slug"), CONSTRAINT "steps_flow_slug_step_index_key" UNIQUE ("flow_slug", "step_index"), CONSTRAINT "steps_flow_slug_fkey" FOREIGN KEY ("flow_slug") REFERENCES "pgflow"."flows" ("flow_slug") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "opt_base_delay_is_nonnegative" CHECK ((opt_base_delay IS NULL) OR (opt_base_delay >= 0)), CONSTRAINT "opt_max_attempts_is_nonnegative" CHECK ((opt_max_attempts IS NULL) OR (opt_max_attempts >= 0)), CONSTRAINT "opt_timeout_is_positive" CHECK ((opt_timeout IS NULL) OR (opt_timeout > 0)), CONSTRAINT "steps_deps_count_check" CHECK (deps_count >= 0), CONSTRAINT "steps_step_slug_check" CHECK (pgflow.is_valid_slug(step_slug)), CONSTRAINT "steps_step_type_check" CHECK (step_type = 'single'::text));
-- Create "deps" table
CREATE TABLE "pgflow"."deps" ("flow_slug" text NOT NULL, "dep_slug" text NOT NULL, "step_slug" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("flow_slug", "dep_slug", "step_slug"), CONSTRAINT "deps_flow_slug_dep_slug_fkey" FOREIGN KEY ("flow_slug", "dep_slug") REFERENCES "pgflow"."steps" ("flow_slug", "step_slug") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "deps_flow_slug_fkey" FOREIGN KEY ("flow_slug") REFERENCES "pgflow"."flows" ("flow_slug") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "deps_flow_slug_step_slug_fkey" FOREIGN KEY ("flow_slug", "step_slug") REFERENCES "pgflow"."steps" ("flow_slug", "step_slug") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "deps_check" CHECK (dep_slug <> step_slug));
-- Create index "idx_deps_by_flow_dep" to table: "deps"
CREATE INDEX "idx_deps_by_flow_dep" ON "pgflow"."deps" ("flow_slug", "dep_slug");
-- Create index "idx_deps_by_flow_step" to table: "deps"
CREATE INDEX "idx_deps_by_flow_step" ON "pgflow"."deps" ("flow_slug", "step_slug");
-- Create "runs" table
CREATE TABLE "pgflow"."runs" ("run_id" uuid NOT NULL DEFAULT gen_random_uuid(), "flow_slug" text NOT NULL, "status" text NOT NULL DEFAULT 'started', "input" jsonb NOT NULL, "output" jsonb NULL, "remaining_steps" integer NOT NULL DEFAULT 0, "started_at" timestamptz NOT NULL DEFAULT now(), "completed_at" timestamptz NULL, "failed_at" timestamptz NULL, PRIMARY KEY ("run_id"), CONSTRAINT "runs_flow_slug_fkey" FOREIGN KEY ("flow_slug") REFERENCES "pgflow"."flows" ("flow_slug") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "completed_at_is_after_started_at" CHECK ((completed_at IS NULL) OR (completed_at >= started_at)), CONSTRAINT "completed_at_or_failed_at" CHECK (NOT ((completed_at IS NOT NULL) AND (failed_at IS NOT NULL))), CONSTRAINT "failed_at_is_after_started_at" CHECK ((failed_at IS NULL) OR (failed_at >= started_at)), CONSTRAINT "runs_remaining_steps_check" CHECK (remaining_steps >= 0), CONSTRAINT "status_is_valid" CHECK (status = ANY (ARRAY['started'::text, 'failed'::text, 'completed'::text])));
-- Create index "idx_runs_flow_slug" to table: "runs"
CREATE INDEX "idx_runs_flow_slug" ON "pgflow"."runs" ("flow_slug");
-- Create index "idx_runs_status" to table: "runs"
CREATE INDEX "idx_runs_status" ON "pgflow"."runs" ("status");
-- Create "step_states" table
CREATE TABLE "pgflow"."step_states" ("flow_slug" text NOT NULL, "run_id" uuid NOT NULL, "step_slug" text NOT NULL, "status" text NOT NULL DEFAULT 'created', "remaining_tasks" integer NOT NULL DEFAULT 1, "remaining_deps" integer NOT NULL DEFAULT 0, "created_at" timestamptz NOT NULL DEFAULT now(), "started_at" timestamptz NULL, "completed_at" timestamptz NULL, "failed_at" timestamptz NULL, PRIMARY KEY ("run_id", "step_slug"), CONSTRAINT "step_states_flow_slug_fkey" FOREIGN KEY ("flow_slug") REFERENCES "pgflow"."flows" ("flow_slug") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "step_states_flow_slug_step_slug_fkey" FOREIGN KEY ("flow_slug", "step_slug") REFERENCES "pgflow"."steps" ("flow_slug", "step_slug") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "step_states_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "pgflow"."runs" ("run_id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "completed_at_is_after_started_at" CHECK ((completed_at IS NULL) OR (completed_at >= started_at)), CONSTRAINT "completed_at_or_failed_at" CHECK (NOT ((completed_at IS NOT NULL) AND (failed_at IS NOT NULL))), CONSTRAINT "failed_at_is_after_started_at" CHECK ((failed_at IS NULL) OR (failed_at >= started_at)), CONSTRAINT "started_at_is_after_created_at" CHECK ((started_at IS NULL) OR (started_at >= created_at)), CONSTRAINT "status_and_remaining_tasks_match" CHECK ((status <> 'completed'::text) OR (remaining_tasks = 0)), CONSTRAINT "status_is_valid" CHECK (status = ANY (ARRAY['created'::text, 'started'::text, 'completed'::text, 'failed'::text])), CONSTRAINT "step_states_remaining_deps_check" CHECK (remaining_deps >= 0), CONSTRAINT "step_states_remaining_tasks_check" CHECK (remaining_tasks >= 0));
-- Create index "idx_step_states_failed" to table: "step_states"
CREATE INDEX "idx_step_states_failed" ON "pgflow"."step_states" ("run_id", "step_slug") WHERE (status = 'failed'::text);
-- Create index "idx_step_states_flow_slug" to table: "step_states"
CREATE INDEX "idx_step_states_flow_slug" ON "pgflow"."step_states" ("flow_slug");
-- Create index "idx_step_states_ready" to table: "step_states"
CREATE INDEX "idx_step_states_ready" ON "pgflow"."step_states" ("run_id", "status", "remaining_deps") WHERE ((status = 'created'::text) AND (remaining_deps = 0));
-- Create "step_tasks" table
CREATE TABLE "pgflow"."step_tasks" ("flow_slug" text NOT NULL, "run_id" uuid NOT NULL, "step_slug" text NOT NULL, "message_id" bigint NULL, "task_index" integer NOT NULL DEFAULT 0, "status" text NOT NULL DEFAULT 'queued', "attempts_count" integer NOT NULL DEFAULT 0, "error_message" text NULL, "output" jsonb NULL, "queued_at" timestamptz NOT NULL DEFAULT now(), "completed_at" timestamptz NULL, "failed_at" timestamptz NULL, PRIMARY KEY ("run_id", "step_slug", "task_index"), CONSTRAINT "step_tasks_flow_slug_fkey" FOREIGN KEY ("flow_slug") REFERENCES "pgflow"."flows" ("flow_slug") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "step_tasks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "pgflow"."runs" ("run_id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "step_tasks_run_id_step_slug_fkey" FOREIGN KEY ("run_id", "step_slug") REFERENCES "pgflow"."step_states" ("run_id", "step_slug") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "attempts_count_nonnegative" CHECK (attempts_count >= 0), CONSTRAINT "completed_at_is_after_queued_at" CHECK ((completed_at IS NULL) OR (completed_at >= queued_at)), CONSTRAINT "completed_at_or_failed_at" CHECK (NOT ((completed_at IS NOT NULL) AND (failed_at IS NOT NULL))), CONSTRAINT "failed_at_is_after_queued_at" CHECK ((failed_at IS NULL) OR (failed_at >= queued_at)), CONSTRAINT "only_single_task_per_step" CHECK (task_index = 0), CONSTRAINT "output_valid_only_for_completed" CHECK ((output IS NULL) OR (status = 'completed'::text)), CONSTRAINT "valid_status" CHECK (status = ANY (ARRAY['queued'::text, 'completed'::text, 'failed'::text])));
-- Create index "idx_step_tasks_completed" to table: "step_tasks"
CREATE INDEX "idx_step_tasks_completed" ON "pgflow"."step_tasks" ("run_id", "step_slug") WHERE (status = 'completed'::text);
-- Create index "idx_step_tasks_failed" to table: "step_tasks"
CREATE INDEX "idx_step_tasks_failed" ON "pgflow"."step_tasks" ("run_id", "step_slug") WHERE (status = 'failed'::text);
-- Create index "idx_step_tasks_flow_run_step" to table: "step_tasks"
CREATE INDEX "idx_step_tasks_flow_run_step" ON "pgflow"."step_tasks" ("flow_slug", "run_id", "step_slug");
-- Create index "idx_step_tasks_message_id" to table: "step_tasks"
CREATE INDEX "idx_step_tasks_message_id" ON "pgflow"."step_tasks" ("message_id");
-- Create index "idx_step_tasks_queued" to table: "step_tasks"
CREATE INDEX "idx_step_tasks_queued" ON "pgflow"."step_tasks" ("run_id", "step_slug") WHERE (status = 'queued'::text);
-- Create "poll_for_tasks" function
CREATE FUNCTION "pgflow"."poll_for_tasks" ("queue_name" text, "vt" integer, "qty" integer, "max_poll_seconds" integer DEFAULT 5, "poll_interval_ms" integer DEFAULT 100) RETURNS SETOF "pgflow"."step_task_record" LANGUAGE sql SET "search_path" = '' AS $$
with read_messages as (
  select *
  from pgflow.read_with_poll(
    queue_name,
    vt,
    qty,
    max_poll_seconds,
    poll_interval_ms
  )
),
tasks as (
  select
    task.flow_slug,
    task.run_id,
    task.step_slug,
    task.task_index,
    task.message_id
  from pgflow.step_tasks as task
  join read_messages as message on message.msg_id = task.message_id
  where task.message_id = message.msg_id
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
  select pgmq.set_vt(queue_name, st.message_id,
    (select t.vt_delay from timeouts t where t.message_id = st.message_id)
  )
) set_vt;
$$;
-- Create "add_step" function
CREATE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "deps_slugs" text[], "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer) RETURNS "pgflow"."steps" LANGUAGE sql SET "search_path" = '' AS $$
WITH
  next_index AS (
    SELECT COALESCE(MAX(step_index) + 1, 0) as idx
    FROM pgflow.steps
    WHERE flow_slug = add_step.flow_slug
  ),
  create_step AS (
    INSERT INTO pgflow.steps (flow_slug, step_slug, step_index, deps_count, opt_max_attempts, opt_base_delay, opt_timeout)
    SELECT add_step.flow_slug, add_step.step_slug, idx, COALESCE(array_length(deps_slugs, 1), 0), max_attempts, base_delay, timeout
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
-- Create "add_step" function
CREATE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer) RETURNS "pgflow"."steps" LANGUAGE sql SET "search_path" = '' AS $$
-- Call the original function with an empty array
    SELECT * FROM pgflow.add_step(flow_slug, step_slug, ARRAY[]::text[], max_attempts, base_delay, timeout);
$$;
-- Create "calculate_retry_delay" function
CREATE FUNCTION "pgflow"."calculate_retry_delay" ("base_delay" numeric, "attempts_count" integer) RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ select floor(base_delay * power(2, attempts_count))::int $$;
-- Create "maybe_complete_run" function
CREATE FUNCTION "pgflow"."maybe_complete_run" ("run_id" uuid) RETURNS void LANGUAGE sql SET "search_path" = '' AS $$
-- Update run status to completed and set output when there are no remaining steps
  -- All done in a single declarative SQL statement
  UPDATE pgflow.runs
  SET
    status = 'completed',
    completed_at = now(),
    output = (
      -- Get outputs from final steps (steps that are not dependencies for other steps)
      SELECT jsonb_object_agg(st.step_slug, st.output)
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
  WHERE pgflow.runs.run_id = maybe_complete_run.run_id
    AND pgflow.runs.remaining_steps = 0
    AND pgflow.runs.status != 'completed';
$$;
-- Create "start_ready_steps" function
CREATE FUNCTION "pgflow"."start_ready_steps" ("run_id" uuid) RETURNS void LANGUAGE sql SET "search_path" = '' AS $$
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
)
INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, message_id)
SELECT
  sent_messages.flow_slug,
  sent_messages.run_id,
  sent_messages.step_slug,
  sent_messages.msg_id
FROM sent_messages;
$$;
-- Create "complete_task" function
CREATE FUNCTION "pgflow"."complete_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
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
-- Create "create_flow" function
CREATE FUNCTION "pgflow"."create_flow" ("flow_slug" text, "max_attempts" integer DEFAULT 3, "base_delay" integer DEFAULT 5, "timeout" integer DEFAULT 60) RETURNS "pgflow"."flows" LANGUAGE sql SET "search_path" = '' AS $$
WITH
  flow_upsert AS (
    INSERT INTO pgflow.flows (flow_slug, opt_max_attempts, opt_base_delay, opt_timeout)
    VALUES (flow_slug, max_attempts, base_delay, timeout)
    ON CONFLICT (flow_slug) DO UPDATE
    SET flow_slug = pgflow.flows.flow_slug -- Dummy update
    RETURNING *
  ),
  ensure_queue AS (
    SELECT pgmq.create(flow_slug)
    WHERE NOT EXISTS (
      SELECT 1 FROM pgmq.list_queues() WHERE queue_name = flow_slug
    )
  )
SELECT f.*
FROM flow_upsert f
LEFT JOIN (SELECT 1 FROM ensure_queue) _dummy ON true; -- Left join ensures flow is returned
$$;
-- Create "fail_task" function
CREATE FUNCTION "pgflow"."fail_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "error_message" text) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
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
    error_message = fail_task.error_message
  WHERE task.run_id = fail_task.run_id
    AND task.step_slug = fail_task.step_slug
    AND task.task_index = fail_task.task_index
    AND task.status = 'queued'
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
-- Create "start_flow" function
CREATE FUNCTION "pgflow"."start_flow" ("flow_slug" text, "input" jsonb) RETURNS SETOF "pgflow"."runs" LANGUAGE plpgsql SET "search_path" = '' AS $$
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
    INSERT INTO pgflow.runs (flow_slug, input, remaining_steps)
    VALUES (
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
      (SELECT run_id FROM created_run),
      fs.step_slug,
      fs.deps_count
    FROM flow_steps fs
  )
SELECT * FROM created_run INTO v_created_run;

PERFORM pgflow.start_ready_steps(v_created_run.run_id);

RETURN QUERY SELECT * FROM pgflow.runs where run_id = v_created_run.run_id;

end;
$$;
-- Create "workers" table
CREATE TABLE "pgflow"."workers" ("worker_id" uuid NOT NULL, "queue_name" text NOT NULL, "function_name" text NOT NULL, "started_at" timestamptz NOT NULL DEFAULT now(), "stopped_at" timestamptz NULL, "last_heartbeat_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("worker_id"));
-- Create index "idx_workers_queue_name" to table: "workers"
CREATE INDEX "idx_workers_queue_name" ON "pgflow"."workers" ("queue_name");

-- Bounded lock waits: fail fast instead of queueing indefinitely behind
-- long-running transactions when the migration takes table locks (#650).
SET lock_timeout = '10s';
-- Create "is_valid_queue_name" function
CREATE FUNCTION "pgflow"."is_valid_queue_name" ("queue_name" text) RETURNS boolean LANGUAGE sql IMMUTABLE SET "search_path" = '' AS $$
-- Mirrors pgmq.validate_queue_name() (47-character limit) and additionally
  -- requires the canonical lowercase spelling pgflow stores (#650).
  select
    queue_name is not null
    and queue_name <> ''
    and length(queue_name) <= 47
    and queue_name = lower(queue_name)
$$;
-- Modify "step_tasks" table (staged: nullable column, backfill, then constraints)
ALTER TABLE "pgflow"."step_tasks" ADD COLUMN "queue_name" text NULL;
-- Modify "steps" table (staged: nullable column, backfill, then constraints)
ALTER TABLE "pgflow"."steps" ADD COLUMN "queue_name" text NULL;

-- ==========================================
-- DATA BACKFILL: queue identity snapshots (#650)
-- Every step and task routes to its flow's default queue: lower(flow_slug).
-- Includes tasks whose message_id is NULL. Duplicate identities, queue names
-- beyond PGMQ's limit, or conflicting normalized flow slugs raise in the
-- constraint and index statements below and leave the database unchanged;
-- they are not repaired automatically.
-- ==========================================
UPDATE pgflow.steps SET queue_name = lower(flow_slug) WHERE queue_name IS NULL;
UPDATE pgflow.step_tasks SET queue_name = lower(flow_slug) WHERE queue_name IS NULL;

ALTER TABLE "pgflow"."step_tasks" ALTER COLUMN "queue_name" SET NOT NULL, ADD CONSTRAINT "queue_name_is_valid" CHECK (pgflow.is_valid_queue_name(queue_name));
ALTER TABLE "pgflow"."steps" ALTER COLUMN "queue_name" SET NOT NULL, ADD CONSTRAINT "queue_name_is_valid" CHECK (pgflow.is_valid_queue_name(queue_name));
-- Drop index "idx_step_tasks_message_id" from table: "step_tasks"
-- Replaced by the queue-scoped unique index below (#650)
DROP INDEX "pgflow"."idx_step_tasks_message_id";
-- Create index "idx_step_tasks_queue_message" to table: "step_tasks"
-- Created after the backfill (approved staged order): duplicate
-- (queue_name, message_id) pairs fail this statement and roll the whole
-- migration back atomically.
CREATE UNIQUE INDEX "idx_step_tasks_queue_message" ON "pgflow"."step_tasks" ("queue_name", "message_id") WHERE (message_id IS NOT NULL);
-- Create index "idx_flows_normalized_slug" to table: "flows"
-- Created after the backfill (approved staged order): conflicting normalized
-- flow slugs fail this statement and roll the whole migration back atomically.
CREATE UNIQUE INDEX "idx_flows_normalized_slug" ON "pgflow"."flows" ((lower(flow_slug)));
-- Create "_listed_queue_name" function
CREATE FUNCTION "pgflow"."_listed_queue_name" ("p_queue_name" text) RETURNS text LANGUAGE plpgsql STABLE SET "search_path" = '' AS $$
declare
  v_matches text[];
begin
  -- Resolve every listed spelling of the normalized name before preferring
  -- any single match: an ambiguous pair is rejected even when one spelling
  -- is the exact requested name (#650).
  select array_agg(listed.queue_name order by listed.queue_name)
  into v_matches
  from pgmq.list_queues() as listed
  where lower(listed.queue_name) = lower(p_queue_name);

  if v_matches is null then
    -- Not listed: pass through; PGMQ reports its own error (or no-ops)
    return p_queue_name;
  elsif cardinality(v_matches) > 1 then
    raise exception
      'queue name "%" is ambiguous: it matches listed queues %',
      p_queue_name, v_matches
      using errcode = 'ambiguous_alias';
  else
    return v_matches[1];
  end if;
end;
$$;
-- Create "_effective_queue_name" function
CREATE FUNCTION "pgflow"."_effective_queue_name" ("p_queue_name" text) RETURNS text LANGUAGE plpgsql STABLE SET "search_path" = '' AS $$
declare
  v_cached text;
  v_result text;
begin
  v_cached := current_setting('pgflow.queue_name.' || p_queue_name, true);
  if v_cached is not null then
    return v_cached;
  end if;

  v_result := pgflow._listed_queue_name(p_queue_name);

  perform set_config('pgflow.queue_name.' || p_queue_name, v_result, false);
  return v_result;
end;
$$;
-- Modify "_archive_task_message" function
CREATE OR REPLACE FUNCTION "pgflow"."_archive_task_message" ("p_run_id" uuid, "p_step_slug" text, "p_task_index" integer) RETURNS void LANGUAGE sql SET "search_path" = '' AS $$
-- Archive through the task's stored queue snapshot (#650), resolved to the
  -- spelling listed in pgmq for queues created by older releases.
  SELECT pgmq.archive(
    pgflow._effective_queue_name(st.queue_name),
    ARRAY_AGG(st.message_id)
  )
  FROM pgflow.step_tasks st
  WHERE st.run_id = p_run_id
    AND st.step_slug = p_step_slug
    AND st.task_index = p_task_index
    AND st.message_id IS NOT NULL
  GROUP BY st.queue_name
  HAVING COUNT(st.message_id) > 0;
$$;
-- Modify "_cascade_force_skip_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."_cascade_force_skip_steps" ("run_id" uuid, "step_slug" text, "skip_reason" text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_flow_slug text;
  v_total_skipped int := 0;
BEGIN
  -- Get flow_slug for this run
  SELECT r.flow_slug INTO v_flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = _cascade_force_skip_steps.run_id;

  IF v_flow_slug IS NULL THEN
    RAISE EXCEPTION 'Run not found: %', _cascade_force_skip_steps.run_id;
  END IF;

  -- ==========================================
  -- SKIP STEPS IN TOPOLOGICAL ORDER
  -- ==========================================
  -- Use recursive CTE to find all downstream dependents,
  -- then skip them in topological order (by step_index)
  WITH RECURSIVE
  -- ---------- Find all downstream steps ----------
  downstream_steps AS (
    -- Base case: the trigger step
    SELECT
      s.flow_slug,
      s.step_slug,
      s.step_index,
      _cascade_force_skip_steps.skip_reason AS reason  -- Original reason for trigger step
    FROM pgflow.steps s
    WHERE s.flow_slug = v_flow_slug
      AND s.step_slug = _cascade_force_skip_steps.step_slug

    UNION ALL

    -- Recursive case: steps that depend on already-found steps
    SELECT
      s.flow_slug,
      s.step_slug,
      s.step_index,
      'dependency_skipped'::text AS reason  -- Downstream steps get this reason
    FROM pgflow.steps s
    JOIN pgflow.deps d ON d.flow_slug = s.flow_slug AND d.step_slug = s.step_slug
    JOIN downstream_steps ds ON ds.flow_slug = d.flow_slug AND ds.step_slug = d.dep_slug
  ),
  -- ---------- Deduplicate and order by step_index ----------
  steps_to_skip AS (
    SELECT DISTINCT ON (ds.step_slug)
      ds.flow_slug,
      ds.step_slug,
      ds.step_index,
      ds.reason
    FROM downstream_steps ds
    ORDER BY ds.step_slug, ds.step_index  -- Keep first occurrence (trigger step has original reason)
  ),
  -- ---------- Skip the steps ----------
  skipped AS (
    UPDATE pgflow.step_states ss
    SET status = 'skipped',
        skip_reason = sts.reason,
        skipped_at = now(),
        remaining_tasks = NULL  -- Clear remaining_tasks for skipped steps
    FROM steps_to_skip sts
    WHERE ss.run_id = _cascade_force_skip_steps.run_id
      AND ss.step_slug = sts.step_slug
      AND ss.status IN ('created', 'started')  -- Only skip non-terminal steps
    RETURNING
      ss.*,
      -- Broadcast step:skipped event
      realtime.send(
        jsonb_build_object(
          'event_type', 'step:skipped',
          'run_id', ss.run_id,
          'flow_slug', ss.flow_slug,
          'step_slug', ss.step_slug,
          'status', 'skipped',
          'skip_reason', ss.skip_reason,
          'skipped_at', ss.skipped_at
        ),
        concat('step:', ss.step_slug, ':skipped'),
        concat('pgflow:run:', ss.run_id),
        false
      ) as _broadcast_result
  ),
  -- ---------- Terminalize active tasks of newly skipped steps ----------
  skipped_tasks AS (
    UPDATE pgflow.step_tasks AS task
    SET status = 'skipped'
    WHERE task.run_id = _cascade_force_skip_steps.run_id
      AND task.step_slug IN (
        SELECT skipped_step.step_slug
        FROM skipped AS skipped_step
      )
      AND task.status IN ('queued', 'started')
    RETURNING task.message_id, task.queue_name
  ),
  -- ---------- Archive queued/started task messages for skipped steps ----------
  -- Batched per stored queue route, resolved to the listed spelling (#650)
  archived_messages AS (
    SELECT pgmq.archive(
      pgflow._effective_queue_name(task.queue_name),
      ARRAY_AGG(task.message_id)
    ) as result
    FROM skipped_tasks AS task
    WHERE task.message_id IS NOT NULL
    GROUP BY task.queue_name
    HAVING COUNT(task.message_id) > 0
  ),
  -- ---------- Update run counters ----------
  run_updates AS (
    UPDATE pgflow.runs r
    SET remaining_steps = r.remaining_steps - skipped_count.count
    FROM (SELECT COUNT(*) AS count FROM skipped) skipped_count
    WHERE r.run_id = _cascade_force_skip_steps.run_id
      AND skipped_count.count > 0
  )
  SELECT skipped_count.count
  INTO v_total_skipped
  FROM (SELECT COUNT(*) AS count FROM skipped) skipped_count
  LEFT JOIN archived_messages ON true;

  RETURN v_total_skipped;
END;
$$;
-- Modify "add_step" function
CREATE OR REPLACE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "deps_slugs" text[] DEFAULT '{}', "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer, "start_delay" integer DEFAULT NULL::integer, "step_type" text DEFAULT 'single', "required_input_pattern" jsonb DEFAULT NULL::jsonb, "forbidden_input_pattern" jsonb DEFAULT NULL::jsonb, "when_unmet" text DEFAULT 'skip', "when_exhausted" text DEFAULT 'fail') RETURNS "pgflow"."steps" LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  result_step pgflow.steps;
  next_idx int;
BEGIN
  -- Validate map step constraints
  -- Map steps can have either:
  --   0 dependencies (root map - maps over flow input array)
  --   1 dependency (dependent map - maps over dependency output array)
  IF COALESCE(add_step.step_type, 'single') = 'map' AND COALESCE(array_length(add_step.deps_slugs, 1), 0) > 1 THEN
    RAISE EXCEPTION 'Map step "%" can have at most one dependency, but % were provided: %',
      add_step.step_slug,
      COALESCE(array_length(add_step.deps_slugs, 1), 0),
      array_to_string(add_step.deps_slugs, ', ');
  END IF;

  -- Get next step index
  SELECT COALESCE(MAX(s.step_index) + 1, 0) INTO next_idx
  FROM pgflow.steps s
  WHERE s.flow_slug = add_step.flow_slug;

  -- Create the step. queue_name records the step's resolved default route:
  -- lower(flow_slug) for this stage (#650).
  INSERT INTO pgflow.steps (
    flow_slug, step_slug, queue_name, step_type, step_index, deps_count,
    opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay,
    required_input_pattern, forbidden_input_pattern, when_unmet, when_exhausted
  )
  VALUES (
    add_step.flow_slug,
    add_step.step_slug,
    lower(add_step.flow_slug),
    COALESCE(add_step.step_type, 'single'),
    next_idx,
    COALESCE(array_length(add_step.deps_slugs, 1), 0),
    add_step.max_attempts,
    add_step.base_delay,
    add_step.timeout,
    add_step.start_delay,
    add_step.required_input_pattern,
    add_step.forbidden_input_pattern,
    add_step.when_unmet,
    add_step.when_exhausted
  )
  ON CONFLICT ON CONSTRAINT steps_pkey
  DO UPDATE SET
    step_slug = EXCLUDED.step_slug,
    queue_name = EXCLUDED.queue_name
  RETURNING * INTO result_step;

  -- Insert dependencies
  INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
  SELECT add_step.flow_slug, d.dep_slug, add_step.step_slug
  FROM unnest(COALESCE(add_step.deps_slugs, '{}')) AS d(dep_slug)
  WHERE add_step.deps_slugs IS NOT NULL AND array_length(add_step.deps_slugs, 1) > 0
  ON CONFLICT ON CONSTRAINT deps_pkey DO NOTHING;

  RETURN result_step;
END;
$$;
-- Modify "cascade_resolve_conditions" function
CREATE OR REPLACE FUNCTION "pgflow"."cascade_resolve_conditions" ("run_id" uuid) RETURNS boolean LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_run_input jsonb;
  v_run_status text;
  v_first_fail record;
  v_iteration_count int := 0;
  v_max_iterations int := 50;
  v_processed_count int;
  v_run_transitioned boolean;
  v_flow_slug text;
  v_archived_queues int;
BEGIN
  -- ==========================================
  -- GUARD: Early return if run is already terminal
  -- ==========================================
  SELECT r.status, r.input INTO v_run_status, v_run_input
  FROM pgflow.runs r
  WHERE r.run_id = cascade_resolve_conditions.run_id;

  IF v_run_status IN ('failed', 'completed') THEN
    RETURN v_run_status != 'failed';
  END IF;

  -- ==========================================
  -- ITERATE UNTIL CONVERGENCE
  -- ==========================================
  -- After skipping steps, dependents may become ready and need evaluation.
  -- Loop until no more steps are processed.
  LOOP
    v_iteration_count := v_iteration_count + 1;
    IF v_iteration_count > v_max_iterations THEN
      RAISE EXCEPTION 'cascade_resolve_conditions exceeded safety limit of % iterations', v_max_iterations;
    END IF;

    v_processed_count := 0;

    -- ==========================================
    -- PHASE 1a: CHECK FOR FAIL CONDITIONS
    -- ==========================================
    -- Find first step (by topological order) with unmet condition and 'fail' mode.
    -- Condition is unmet when:
    --   (required_input_pattern is set AND input does NOT contain it) OR
    --   (forbidden_input_pattern is set AND input DOES contain it)
    WITH steps_with_conditions AS (
      SELECT
        step_state.flow_slug,
        step_state.step_slug,
        step.required_input_pattern,
        step.forbidden_input_pattern,
        step.when_unmet,
        step.deps_count,
        step.step_index
      FROM pgflow.step_states AS step_state
      JOIN pgflow.steps AS step
        ON step.flow_slug = step_state.flow_slug
        AND step.step_slug = step_state.step_slug
      WHERE step_state.run_id = cascade_resolve_conditions.run_id
        AND step_state.status = 'created'
        AND step_state.remaining_deps = 0
        AND (step.required_input_pattern IS NOT NULL OR step.forbidden_input_pattern IS NOT NULL)
    ),
    step_deps_output AS (
      SELECT
        swc.step_slug,
        jsonb_object_agg(dep_state.step_slug, dep_state.output) AS deps_output
      FROM steps_with_conditions swc
      JOIN pgflow.deps dep ON dep.flow_slug = swc.flow_slug AND dep.step_slug = swc.step_slug
      JOIN pgflow.step_states dep_state
        ON dep_state.run_id = cascade_resolve_conditions.run_id
        AND dep_state.step_slug = dep.dep_slug
        AND dep_state.status = 'completed'  -- Only completed deps (not skipped)
      WHERE swc.deps_count > 0
      GROUP BY swc.step_slug
    ),
    condition_evaluations AS (
      SELECT
        swc.*,
        -- condition_met = (if IS NULL OR input @> if) AND (ifNot IS NULL OR NOT(input @> ifNot))
        (swc.required_input_pattern IS NULL OR
          CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.required_input_pattern)
        AND
        (swc.forbidden_input_pattern IS NULL OR
          NOT (CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.forbidden_input_pattern))
        AS condition_met
      FROM steps_with_conditions swc
      LEFT JOIN step_deps_output sdo ON sdo.step_slug = swc.step_slug
    )
    SELECT
      flow_slug,
      step_slug,
      required_input_pattern,
      forbidden_input_pattern
    INTO v_first_fail
    FROM condition_evaluations
    WHERE NOT condition_met AND when_unmet = 'fail'
    ORDER BY step_index
    LIMIT 1;

    -- Handle fail mode: fail step and run, return false
    -- Note: Cannot use "v_first_fail IS NOT NULL" because records with NULL fields
    -- evaluate to NULL in IS NOT NULL checks. Use FOUND instead.
    IF FOUND THEN
      -- Fail the run only if it is still started. The conditional UPDATE takes
      -- the run row lock and rechecks status atomically, so replayed or
      -- concurrent calls cannot duplicate the terminal transition or its events.
      UPDATE pgflow.runs
      SET status = 'failed',
          failed_at = now()
      WHERE pgflow.runs.run_id = cascade_resolve_conditions.run_id
        AND pgflow.runs.status = 'started'
      RETURNING true INTO v_run_transitioned;

      IF v_run_transitioned THEN
        UPDATE pgflow.step_states
        SET status = 'failed',
            failed_at = now(),
            error_message = 'Condition not met'
        WHERE pgflow.step_states.run_id = cascade_resolve_conditions.run_id
          AND pgflow.step_states.step_slug = v_first_fail.step_slug;

        PERFORM realtime.send(
          jsonb_build_object(
            'event_type', 'step:failed',
            'run_id', cascade_resolve_conditions.run_id,
            'step_slug', v_first_fail.step_slug,
            'status', 'failed',
            'error_message', 'Condition not met',
            'failed_at', now()
          ),
          concat('step:', v_first_fail.step_slug, ':failed'),
          concat('pgflow:run:', cascade_resolve_conditions.run_id),
          false
        );

        PERFORM realtime.send(
          jsonb_build_object(
            'event_type', 'run:failed',
            'run_id', cascade_resolve_conditions.run_id,
            'flow_slug', v_first_fail.flow_slug,
            'status', 'failed',
            'error_message', 'Condition not met',
            'failed_at', now()
          ),
          'run:failed',
          concat('pgflow:run:', cascade_resolve_conditions.run_id),
          false
        );

        -- Terminalize every unfinished task across all branches as cancelled,
        -- then archive the messages batched per stored queue route (#650).
        -- Lock-order invariant: always lock/update step_tasks before PGMQ
        -- queue rows; the archive reads the terminalized rows through the CTE.
        WITH cancelled_tasks AS (
          UPDATE pgflow.step_tasks AS task
          SET status = 'cancelled'
          WHERE task.run_id = cascade_resolve_conditions.run_id
            AND task.status IN ('queued', 'started')
          RETURNING task.message_id, task.queue_name
        ),
        archived_messages AS (
          SELECT pgmq.archive(
            pgflow._effective_queue_name(ct.queue_name),
            ARRAY_AGG(ct.message_id)
          )
          FROM cancelled_tasks ct
          WHERE ct.message_id IS NOT NULL
          GROUP BY ct.queue_name
        )
        SELECT COUNT(*)::int INTO v_archived_queues
        FROM archived_messages;
      END IF;

      RETURN false;
    END IF;

    -- ==========================================
    -- PHASE 1b: HANDLE SKIP CONDITIONS (with propagation)
    -- ==========================================
    -- Skip steps with unmet conditions and whenUnmet='skip'.
    -- Also decrement remaining_deps on dependents and set initial_tasks=0 for map dependents.
    WITH steps_with_conditions AS (
      SELECT
        step_state.flow_slug,
        step_state.step_slug,
        step.required_input_pattern,
        step.forbidden_input_pattern,
        step.when_unmet,
        step.deps_count,
        step.step_index
      FROM pgflow.step_states AS step_state
      JOIN pgflow.steps AS step
        ON step.flow_slug = step_state.flow_slug
        AND step.step_slug = step_state.step_slug
      WHERE step_state.run_id = cascade_resolve_conditions.run_id
        AND step_state.status = 'created'
        AND step_state.remaining_deps = 0
        AND (step.required_input_pattern IS NOT NULL OR step.forbidden_input_pattern IS NOT NULL)
    ),
    step_deps_output AS (
      SELECT
        swc.step_slug,
        jsonb_object_agg(dep_state.step_slug, dep_state.output) AS deps_output
      FROM steps_with_conditions swc
      JOIN pgflow.deps dep ON dep.flow_slug = swc.flow_slug AND dep.step_slug = swc.step_slug
      JOIN pgflow.step_states dep_state
        ON dep_state.run_id = cascade_resolve_conditions.run_id
        AND dep_state.step_slug = dep.dep_slug
        AND dep_state.status = 'completed'  -- Only completed deps (not skipped)
      WHERE swc.deps_count > 0
      GROUP BY swc.step_slug
    ),
    condition_evaluations AS (
      SELECT
        swc.*,
        -- condition_met = (if IS NULL OR input @> if) AND (ifNot IS NULL OR NOT(input @> ifNot))
        (swc.required_input_pattern IS NULL OR
          CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.required_input_pattern)
        AND
        (swc.forbidden_input_pattern IS NULL OR
          NOT (CASE WHEN swc.deps_count = 0 THEN v_run_input ELSE COALESCE(sdo.deps_output, '{}'::jsonb) END @> swc.forbidden_input_pattern))
        AS condition_met
      FROM steps_with_conditions swc
      LEFT JOIN step_deps_output sdo ON sdo.step_slug = swc.step_slug
    ),
    unmet_skip_steps AS (
      SELECT * FROM condition_evaluations
      WHERE NOT condition_met AND when_unmet = 'skip'
    ),
    skipped_steps AS (
      UPDATE pgflow.step_states ss
      SET status = 'skipped',
          skip_reason = 'condition_unmet',
          skipped_at = now()
      FROM unmet_skip_steps uss
      WHERE ss.run_id = cascade_resolve_conditions.run_id
        AND ss.step_slug = uss.step_slug
        AND ss.status = 'created'
      RETURNING
        ss.*,
        realtime.send(
          jsonb_build_object(
            'event_type', 'step:skipped',
            'run_id', ss.run_id,
            'flow_slug', ss.flow_slug,
            'step_slug', ss.step_slug,
            'status', 'skipped',
            'skip_reason', 'condition_unmet',
            'skipped_at', ss.skipped_at
          ),
          concat('step:', ss.step_slug, ':skipped'),
          concat('pgflow:run:', ss.run_id),
          false
        ) AS _broadcast_result
    ),
    -- NEW: Update dependent steps (decrement remaining_deps by count of skipped parents, set initial_tasks=0 for maps)
    skipped_parent_counts AS (
      -- Count how many skipped parents each child has
      SELECT
        dep.step_slug AS child_step_slug,
        dep.flow_slug AS child_flow_slug,
        COUNT(*) AS skipped_parent_count
      FROM skipped_steps parent
      JOIN pgflow.deps dep ON dep.flow_slug = parent.flow_slug AND dep.dep_slug = parent.step_slug
      GROUP BY dep.step_slug, dep.flow_slug
    ),
    dependent_updates AS (
      UPDATE pgflow.step_states child_state
      SET remaining_deps = child_state.remaining_deps - spc.skipped_parent_count,
          -- If child is a map step and this skipped step is its only dependency,
          -- set initial_tasks = 0 (skipped dep = empty array)
          initial_tasks = CASE
            WHEN child_step.step_type = 'map' AND child_step.deps_count = 1 THEN 0
            ELSE child_state.initial_tasks
          END
      FROM skipped_parent_counts spc
      JOIN pgflow.steps child_step ON child_step.flow_slug = spc.child_flow_slug AND child_step.step_slug = spc.child_step_slug
      WHERE child_state.run_id = cascade_resolve_conditions.run_id
        AND child_state.step_slug = spc.child_step_slug
    ),
    run_update AS (
      UPDATE pgflow.runs r
      SET remaining_steps = r.remaining_steps - (SELECT COUNT(*) FROM skipped_steps)
      WHERE r.run_id = cascade_resolve_conditions.run_id
        AND (SELECT COUNT(*) FROM skipped_steps) > 0
    )
    SELECT COUNT(*)::int INTO v_processed_count FROM skipped_steps;

    -- ==========================================
    -- PHASE 1c: HANDLE SKIP-CASCADE CONDITIONS
    -- ==========================================
    -- Call _cascade_force_skip_steps for each step with unmet condition and whenUnmet='skip-cascade'.
    -- Process in topological order; _cascade_force_skip_steps is idempotent.
    PERFORM pgflow._cascade_force_skip_steps(cascade_resolve_conditions.run_id, ready_step.step_slug, 'condition_unmet')
    FROM pgflow.step_states AS ready_step
    JOIN pgflow.steps AS step
      ON step.flow_slug = ready_step.flow_slug
      AND step.step_slug = ready_step.step_slug
    LEFT JOIN LATERAL (
      SELECT jsonb_object_agg(dep_state.step_slug, dep_state.output) AS deps_output
      FROM pgflow.deps dep
      JOIN pgflow.step_states dep_state
        ON dep_state.run_id = cascade_resolve_conditions.run_id
        AND dep_state.step_slug = dep.dep_slug
        AND dep_state.status = 'completed'  -- Only completed deps (not skipped)
      WHERE dep.flow_slug = ready_step.flow_slug
        AND dep.step_slug = ready_step.step_slug
    ) AS agg_deps ON step.deps_count > 0
    WHERE ready_step.run_id = cascade_resolve_conditions.run_id
      AND ready_step.status = 'created'
      AND ready_step.remaining_deps = 0
      AND (step.required_input_pattern IS NOT NULL OR step.forbidden_input_pattern IS NOT NULL)
      AND step.when_unmet = 'skip-cascade'
      -- Condition is NOT met when: (if fails) OR (ifNot fails)
      AND NOT (
        (step.required_input_pattern IS NULL OR
          CASE WHEN step.deps_count = 0 THEN v_run_input ELSE COALESCE(agg_deps.deps_output, '{}'::jsonb) END @> step.required_input_pattern)
        AND
        (step.forbidden_input_pattern IS NULL OR
          NOT (CASE WHEN step.deps_count = 0 THEN v_run_input ELSE COALESCE(agg_deps.deps_output, '{}'::jsonb) END @> step.forbidden_input_pattern))
      )
    ORDER BY step.step_index;

    -- Check if run was failed during cascade (e.g., if _cascade_force_skip_steps triggers fail)
    SELECT r.status INTO v_run_status
    FROM pgflow.runs r
    WHERE r.run_id = cascade_resolve_conditions.run_id;

    IF v_run_status IN ('failed', 'completed') THEN
      RETURN v_run_status != 'failed';
    END IF;

    -- Exit loop if no steps were processed in this iteration
    EXIT WHEN v_processed_count = 0;
  END LOOP;

  RETURN true;
END;
$$;
-- Modify "start_ready_steps" function
CREATE OR REPLACE FUNCTION "pgflow"."start_ready_steps" ("run_id" uuid) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
BEGIN
-- ==========================================
-- GUARD: No mutations on terminal runs
-- ==========================================
IF EXISTS (
  SELECT 1 FROM pgflow.runs
  WHERE pgflow.runs.run_id = start_ready_steps.run_id
    AND pgflow.runs.status IN ('failed', 'completed')
) THEN
  RETURN;
END IF;

-- ==========================================
-- PHASE 1: START READY STEPS
-- ==========================================
-- NOTE: Condition evaluation and empty map handling are done by
-- cascade_resolve_conditions() and cascade_complete_taskless_steps()
-- which are called before this function.
WITH
-- ---------- Find ready steps ----------
-- Steps with no remaining deps and known task count
ready_steps AS (
  SELECT *
  FROM pgflow.step_states AS step_state
  WHERE step_state.run_id = start_ready_steps.run_id
    AND step_state.status = 'created'
    AND step_state.remaining_deps = 0
    AND step_state.initial_tasks IS NOT NULL  -- Cannot start with unknown count
    AND step_state.initial_tasks > 0  -- Don't start taskless steps (handled by cascade_complete_taskless_steps)
  ORDER BY step_state.step_slug
  FOR UPDATE
),
-- ---------- Mark steps as started ----------
started_step_states AS (
  UPDATE pgflow.step_states
  SET status = 'started',
      started_at = now(),
      remaining_tasks = ready_steps.initial_tasks  -- Copy initial_tasks to remaining_tasks when starting
  FROM ready_steps
  WHERE pgflow.step_states.run_id = start_ready_steps.run_id
    AND pgflow.step_states.step_slug = ready_steps.step_slug
  RETURNING pgflow.step_states.*,
    -- Broadcast step:started event atomically with the UPDATE
    -- Using RETURNING ensures this executes during row processing
    -- and cannot be optimized away by the query planner
    realtime.send(
      jsonb_build_object(
        'event_type', 'step:started',
        'run_id', pgflow.step_states.run_id,
        'step_slug', pgflow.step_states.step_slug,
        'status', 'started',
        'started_at', pgflow.step_states.started_at,
        'remaining_tasks', pgflow.step_states.remaining_tasks,
        'remaining_deps', pgflow.step_states.remaining_deps
      ),
      concat('step:', pgflow.step_states.step_slug, ':started'),
      concat('pgflow:run:', pgflow.step_states.run_id),
      false
    ) as _broadcast_result  -- Prefix with _ to indicate internal use only
),

-- ==========================================
-- PHASE 2: TASK GENERATION AND QUEUE MESSAGES
-- ==========================================
-- ---------- Generate tasks and batch messages ----------
-- Single steps: 1 task (index 0)
-- Map steps: N tasks (indices 0..N-1)
message_batches AS (
  SELECT
    started_step.flow_slug,
    started_step.run_id,
    started_step.step_slug,
    step.queue_name,
    COALESCE(step.opt_start_delay, 0) as delay,
    array_agg(
      jsonb_build_object(
        'flow_slug', started_step.flow_slug,
        'run_id', started_step.run_id,
        'step_slug', started_step.step_slug,
        'task_index', task_idx.task_index
      ) ORDER BY task_idx.task_index
    ) AS messages,
    array_agg(task_idx.task_index ORDER BY task_idx.task_index) AS task_indices
  FROM started_step_states AS started_step
  JOIN pgflow.steps AS step
    ON step.flow_slug = started_step.flow_slug
    AND step.step_slug = started_step.step_slug
  -- Generate task indices from 0 to initial_tasks-1
  CROSS JOIN LATERAL generate_series(0, started_step.initial_tasks - 1) AS task_idx(task_index)
  GROUP BY started_step.flow_slug, started_step.run_id, started_step.step_slug, step.queue_name, step.opt_start_delay
),
-- ---------- Send messages to queue ----------
-- Uses batch sending for performance with large arrays.
-- Messages go through the step's persisted queue route, resolved to the
-- spelling listed in pgmq (#650).
sent_messages AS (
  SELECT
    mb.flow_slug,
    mb.run_id,
    mb.step_slug,
    mb.queue_name,
    task_indices.task_index,
    msg_ids.msg_id
  FROM message_batches mb
  CROSS JOIN LATERAL unnest(mb.task_indices) WITH ORDINALITY AS task_indices(task_index, idx_ord)
  CROSS JOIN LATERAL pgmq.send_batch(
    pgflow._effective_queue_name(mb.queue_name),
    mb.messages,
    mb.delay
  ) WITH ORDINALITY AS msg_ids(msg_id, msg_ord)
  WHERE task_indices.idx_ord = msg_ids.msg_ord
)

-- ==========================================
-- PHASE 3: RECORD TASKS IN DATABASE
-- ==========================================
-- The task stores the step's queue_name snapshot; runtime message operations
-- use that snapshot, never a queue reconstructed from flow_slug (#650).
INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, queue_name, task_index, message_id)
SELECT
  sent_messages.flow_slug,
  sent_messages.run_id,
  sent_messages.step_slug,
  sent_messages.queue_name,
  sent_messages.task_index,
  sent_messages.msg_id
FROM sent_messages;

END;
$$;
-- Modify "complete_task" function
CREATE OR REPLACE FUNCTION "pgflow"."complete_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "output" jsonb) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_step_state pgflow.step_states%ROWTYPE;
  v_dependent_map_slug text;
  v_run_record pgflow.runs%ROWTYPE;
  v_step_record pgflow.step_states%ROWTYPE;
  v_violation_archived_queues int;
begin

-- ==========================================
-- GUARD: No mutations on failed runs
-- ==========================================
IF EXISTS (SELECT 1 FROM pgflow.runs WHERE pgflow.runs.run_id = complete_task.run_id AND pgflow.runs.status = 'failed') THEN
  RETURN QUERY SELECT * FROM pgflow.step_tasks
    WHERE pgflow.step_tasks.run_id = complete_task.run_id
      AND pgflow.step_tasks.step_slug = complete_task.step_slug
      AND pgflow.step_tasks.task_index = complete_task.task_index;
  RETURN;
END IF;

-- ==========================================
-- LOCK ACQUISITION AND TYPE VALIDATION
-- ==========================================
-- Acquire locks first to prevent race conditions
SELECT * INTO v_run_record FROM pgflow.runs
WHERE pgflow.runs.run_id = complete_task.run_id
FOR UPDATE;

SELECT * INTO v_step_record FROM pgflow.step_states
WHERE pgflow.step_states.run_id = complete_task.run_id
  AND pgflow.step_states.step_slug = complete_task.step_slug
FOR UPDATE;

-- ==========================================
-- GUARD: Run failed while this callback waited for the lock
-- ==========================================
-- The failed-run guard above ran before the failure committed. Recheck under
-- lock so cancellation wins: archived message stays archived, task row keeps
-- its terminal status, and no events or counters are emitted.
IF v_run_record.status = 'failed' THEN
  -- Archive the task message if present (no-op when already archived)
  PERFORM pgflow._archive_task_message(
    complete_task.run_id,
    complete_task.step_slug,
    complete_task.task_index
  );
  -- Return the current task row without any mutations
  RETURN QUERY SELECT * FROM pgflow.step_tasks
    WHERE pgflow.step_tasks.run_id = complete_task.run_id
      AND pgflow.step_tasks.step_slug = complete_task.step_slug
      AND pgflow.step_tasks.task_index = complete_task.task_index;
  RETURN;
END IF;

-- ==========================================
-- GUARD: Late callback - step not started
-- ==========================================
-- If the step is not in 'started' state, this is a late callback.
-- Do not mutate step_states or runs, archive message, return task row.
IF v_step_record.status != 'started' THEN
  -- Archive the task message if present (prevents stuck work), through the
  -- task's stored queue snapshot (#650)
  PERFORM pgflow._archive_task_message(
    complete_task.run_id,
    complete_task.step_slug,
    complete_task.task_index
  );
  -- Return the current task row without any mutations
  RETURN QUERY SELECT * FROM pgflow.step_tasks
    WHERE pgflow.step_tasks.run_id = complete_task.run_id
      AND pgflow.step_tasks.step_slug = complete_task.step_slug
      AND pgflow.step_tasks.task_index = complete_task.task_index;
  RETURN;
END IF;

-- Check for type violations AFTER acquiring locks
SELECT child_step.step_slug INTO v_dependent_map_slug
FROM pgflow.deps dependency
JOIN pgflow.steps child_step ON child_step.flow_slug = dependency.flow_slug
                             AND child_step.step_slug = dependency.step_slug
JOIN pgflow.steps parent_step ON parent_step.flow_slug = dependency.flow_slug
                              AND parent_step.step_slug = dependency.dep_slug
JOIN pgflow.step_states child_state ON child_state.flow_slug = child_step.flow_slug
                                    AND child_state.step_slug = child_step.step_slug
WHERE dependency.dep_slug = complete_task.step_slug  -- parent is the completing step
  AND dependency.flow_slug = v_run_record.flow_slug
  AND parent_step.step_type = 'single'  -- Only validate single steps
  AND child_step.step_type = 'map'
  AND child_state.run_id = complete_task.run_id
  AND child_state.initial_tasks IS NULL
  AND (complete_task.output IS NULL OR jsonb_typeof(complete_task.output) != 'array')
LIMIT 1;

-- Handle type violation if detected
IF v_dependent_map_slug IS NOT NULL THEN
  -- Mark current task as failed FIRST and store the output that caused the
  -- violation, so the task row is terminal before any queue row is touched.
  UPDATE pgflow.step_tasks
  SET status = 'failed',
      failed_at = now(),
      output = complete_task.output,  -- Store the output that caused the violation
      error_message = '[TYPE_VIOLATION] Produced ' ||
                     CASE WHEN complete_task.output IS NULL THEN 'null'
                          ELSE jsonb_typeof(complete_task.output) END ||
                     ' instead of array'
  WHERE pgflow.step_tasks.run_id = complete_task.run_id
    AND pgflow.step_tasks.step_slug = complete_task.step_slug
    AND pgflow.step_tasks.task_index = complete_task.task_index;

  -- Mark run as failed immediately
  UPDATE pgflow.runs
  SET status = 'failed',
      failed_at = now()
  WHERE pgflow.runs.run_id = complete_task.run_id;

  -- Broadcast run:failed event
  -- Uses PERFORM pattern to ensure execution (proven reliable pattern in this function)
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'run:failed',
      'run_id', complete_task.run_id,
      'flow_slug', v_run_record.flow_slug,
      'status', 'failed',
      'failed_at', now()
    ),
    'run:failed',
    concat('pgflow:run:', complete_task.run_id),
    false
  );

  -- Mark step state as failed
  UPDATE pgflow.step_states
  SET status = 'failed',
      failed_at = now(),
      error_message = '[TYPE_VIOLATION] Map step ' || v_dependent_map_slug ||
                     ' expects array input but dependency ' || complete_task.step_slug ||
                     ' produced ' || CASE WHEN complete_task.output IS NULL THEN 'null'
                                         ELSE jsonb_typeof(complete_task.output) END
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug;

  -- Broadcast step:failed event
  -- Uses PERFORM pattern to ensure execution (proven reliable pattern in this function)
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:failed',
      'run_id', complete_task.run_id,
      'step_slug', complete_task.step_slug,
      'status', 'failed',
      'error_message', '[TYPE_VIOLATION] Map step ' || v_dependent_map_slug ||
                      ' expects array input but dependency ' || complete_task.step_slug ||
                      ' produced ' || CASE WHEN complete_task.output IS NULL THEN 'null'
                                          ELSE jsonb_typeof(complete_task.output) END,
      'failed_at', now()
    ),
    concat('step:', complete_task.step_slug, ':failed'),
    concat('pgflow:run:', complete_task.run_id),
    false
  );

  -- Terminalize every other unfinished task as cancelled, then archive the
  -- culprit and cancelled messages batched per stored queue route (#650).
  -- Lock-order invariant: always lock/update step_tasks before PGMQ queue
  -- rows; the archive reads the terminalized rows through the CTE.
  -- The culprit task is already terminal (failed above), so it is excluded
  -- from the cancellation set.
  WITH cancelled_tasks AS (
    UPDATE pgflow.step_tasks AS task
    SET status = 'cancelled'
    WHERE task.run_id = complete_task.run_id
      AND task.status IN ('queued', 'started')
    RETURNING task.message_id, task.queue_name
  ),
  culprit_task AS (
    -- Terminal culprit row: safe to read for its message id after terminalization
    SELECT st.message_id, st.queue_name
    FROM pgflow.step_tasks st
    WHERE st.run_id = complete_task.run_id
      AND st.step_slug = complete_task.step_slug
      AND st.task_index = complete_task.task_index
      AND st.message_id IS NOT NULL
  ),
  terminal_messages AS (
    SELECT message_id, queue_name FROM culprit_task
    UNION ALL
    SELECT message_id, queue_name FROM cancelled_tasks WHERE message_id IS NOT NULL
  ),
  archived_messages AS (
    SELECT pgmq.archive(
      pgflow._effective_queue_name(tm.queue_name),
      ARRAY_AGG(tm.message_id)
    )
    FROM terminal_messages tm
    GROUP BY tm.queue_name
  )
  SELECT COUNT(*)::int INTO v_violation_archived_queues
  FROM archived_messages;

  -- Return the failed task row (API contract: always return task row)
  RETURN QUERY
  SELECT * FROM pgflow.step_tasks st
  WHERE st.run_id = complete_task.run_id
    AND st.step_slug = complete_task.step_slug
    AND st.task_index = complete_task.task_index;
  RETURN;
END IF;

-- ==========================================
-- MAIN CTE CHAIN: Update task and propagate changes
-- ==========================================
WITH
-- ---------- Task completion ----------
-- Update the task record with completion status and output
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
-- ---------- Get step type for output handling ----------
step_def AS (
  SELECT step.step_type
  FROM pgflow.steps step
  JOIN pgflow.runs run ON run.flow_slug = step.flow_slug
  WHERE run.run_id = complete_task.run_id
    AND step.step_slug = complete_task.step_slug
),
-- ---------- Step state update ----------
-- Decrement remaining_tasks and potentially mark step as completed
-- Also store output atomically with status transition to completed
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
    remaining_tasks = pgflow.step_states.remaining_tasks - 1,
    -- Store output atomically with completion (only when remaining_tasks = 1, meaning step completes)
    output = CASE
      -- Single step: store task output directly when completing
      WHEN (SELECT step_type FROM step_def) = 'single' AND pgflow.step_states.remaining_tasks = 1 THEN
        complete_task.output
      -- Map step: aggregate on completion (ordered by task_index)
      WHEN (SELECT step_type FROM step_def) = 'map' AND pgflow.step_states.remaining_tasks = 1 THEN
        (SELECT COALESCE(jsonb_agg(all_outputs.output ORDER BY all_outputs.task_index), '[]'::jsonb)
         FROM (
           -- All previously completed tasks
           SELECT st.output, st.task_index
           FROM pgflow.step_tasks st
           WHERE st.run_id = complete_task.run_id
             AND st.step_slug = complete_task.step_slug
             AND st.status = 'completed'
           UNION ALL
           -- Current task being completed (not yet visible as completed in snapshot)
           SELECT complete_task.output, complete_task.task_index
         ) all_outputs)
      ELSE pgflow.step_states.output
    END
  FROM task
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug = complete_task.step_slug
  RETURNING pgflow.step_states.*
),
-- ---------- Dependency resolution ----------
-- Find all child steps that depend on the completed parent step (only if parent completed)
child_steps AS (
  SELECT deps.step_slug AS child_step_slug
  FROM pgflow.deps deps
  JOIN step_state parent_state ON parent_state.status = 'completed' AND deps.flow_slug = parent_state.flow_slug
  WHERE deps.dep_slug = complete_task.step_slug  -- dep_slug is the parent, step_slug is the child
  ORDER BY deps.step_slug  -- Ensure consistent ordering
),
-- ---------- Lock child steps ----------
-- Acquire locks on all child steps before updating them
child_steps_lock AS (
  SELECT * FROM pgflow.step_states
  WHERE pgflow.step_states.run_id = complete_task.run_id
    AND pgflow.step_states.step_slug IN (SELECT child_step_slug FROM child_steps)
  FOR UPDATE
),
-- ---------- Update child steps ----------
-- Decrement remaining_deps and resolve NULL initial_tasks for map steps
child_steps_update AS (
  UPDATE pgflow.step_states child_state
  SET remaining_deps = child_state.remaining_deps - 1,
      -- Resolve NULL initial_tasks for child map steps
      -- This is where child maps learn their array size from the parent
      -- This CTE only runs when the parent step is complete (see child_steps JOIN)
      initial_tasks = CASE
        WHEN child_step.step_type = 'map' AND child_state.initial_tasks IS NULL THEN
          CASE
            WHEN parent_step.step_type = 'map' THEN
              -- Map->map: Count all completed tasks from parent map
              -- We add 1 because the current task is being completed in this transaction
              -- but isn't yet visible as 'completed' in the step_tasks table
              -- TODO: Refactor to use future column step_states.total_tasks
              -- Would eliminate the COUNT query and just use parent_state.total_tasks
              (SELECT COUNT(*)::int + 1
               FROM pgflow.step_tasks parent_tasks
               WHERE parent_tasks.run_id = complete_task.run_id
                 AND parent_tasks.step_slug = complete_task.step_slug
                 AND parent_tasks.status = 'completed'
                 AND parent_tasks.task_index != complete_task.task_index)
            ELSE
              -- Single->map: Use output array length (single steps complete immediately)
              CASE
                WHEN complete_task.output IS NOT NULL
                     AND jsonb_typeof(complete_task.output) = 'array' THEN
                  jsonb_array_length(complete_task.output)
                ELSE NULL  -- Keep NULL if not an array
              END
          END
        ELSE child_state.initial_tasks  -- Keep existing value (including NULL)
      END
  FROM child_steps children
  JOIN pgflow.steps child_step ON child_step.flow_slug = (SELECT r.flow_slug FROM pgflow.runs r WHERE r.run_id = complete_task.run_id)
                               AND child_step.step_slug = children.child_step_slug
  JOIN pgflow.steps parent_step ON parent_step.flow_slug = (SELECT r.flow_slug FROM pgflow.runs r WHERE r.run_id = complete_task.run_id)
                                AND parent_step.step_slug = complete_task.step_slug
  WHERE child_state.run_id = complete_task.run_id
    AND child_state.step_slug = children.child_step_slug
)
-- ---------- Update run remaining_steps ----------
-- Decrement the run's remaining_steps counter if step completed
UPDATE pgflow.runs
SET remaining_steps = pgflow.runs.remaining_steps - 1
FROM step_state
WHERE pgflow.runs.run_id = complete_task.run_id
  AND step_state.status = 'completed';

-- ==========================================
-- POST-COMPLETION ACTIONS
-- ==========================================

-- ---------- Get updated state for broadcasting ----------
SELECT * INTO v_step_state FROM pgflow.step_states
WHERE pgflow.step_states.run_id = complete_task.run_id AND pgflow.step_states.step_slug = complete_task.step_slug;

-- ---------- Handle step completion ----------
IF v_step_state.status = 'completed' THEN
  -- Broadcast step:completed event FIRST (before cascade)
  -- This ensures parent broadcasts before its dependent children
  -- Use stored output from step_states (set atomically during status transition)
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:completed',
      'run_id', complete_task.run_id,
      'step_slug', complete_task.step_slug,
      'status', 'completed',
      'output', v_step_state.output,  -- Use stored output instead of re-aggregating
      'completed_at', v_step_state.completed_at
    ),
    concat('step:', complete_task.step_slug, ':completed'),
    concat('pgflow:run:', complete_task.run_id),
    false
  );

  -- THEN evaluate conditions on newly-ready dependent steps
  -- This must happen before cascade_complete_taskless_steps so that
  -- skipped steps can set initial_tasks=0 for their map dependents
  IF NOT pgflow.cascade_resolve_conditions(complete_task.run_id) THEN
    -- Run was failed due to a condition with when_unmet='fail'
    -- Archive the current task's message before returning
    PERFORM pgflow._archive_task_message(
      complete_task.run_id,
      complete_task.step_slug,
      complete_task.task_index
    );
    RETURN QUERY SELECT * FROM pgflow.step_tasks
      WHERE pgflow.step_tasks.run_id = complete_task.run_id
        AND pgflow.step_tasks.step_slug = complete_task.step_slug
        AND pgflow.step_tasks.task_index = complete_task.task_index;
    RETURN;
  END IF;

  -- THEN cascade complete any taskless steps that are now ready
  -- This ensures dependent children broadcast AFTER their parent
  PERFORM pgflow.cascade_complete_taskless_steps(complete_task.run_id);
END IF;

-- ---------- Archive completed task message ----------
-- Move message from active queue to archive table, through the task's
-- stored queue snapshot (#650)
PERFORM (
  WITH completed_tasks AS (
    SELECT st.queue_name, st.message_id
    FROM pgflow.step_tasks st
    WHERE st.run_id = complete_task.run_id
      AND st.step_slug = complete_task.step_slug
      AND st.task_index = complete_task.task_index
      AND st.status = 'completed'
  )
  SELECT pgmq.archive(pgflow._effective_queue_name(ct.queue_name), ct.message_id)
  FROM completed_tasks ct
  WHERE EXISTS (SELECT 1 FROM completed_tasks)
);

-- ---------- Trigger next steps ----------
-- Start any steps that are now ready (deps satisfied)
PERFORM pgflow.start_ready_steps(complete_task.run_id);

-- Check if the entire run is complete
PERFORM pgflow.maybe_complete_run(complete_task.run_id);

-- ---------- Return completed task ----------
RETURN QUERY SELECT *
FROM pgflow.step_tasks AS step_task
WHERE step_task.run_id = complete_task.run_id
  AND step_task.step_slug = complete_task.step_slug
  AND step_task.task_index = complete_task.task_index;

end;
$$;
-- Modify "create_flow" function
CREATE OR REPLACE FUNCTION "pgflow"."create_flow" ("flow_slug" text, "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer) RETURNS "pgflow"."flows" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  v_flow pgflow.flows;
begin
  if not exists (
    select 1
    from pgflow.flows as flow
    where lower(flow.flow_slug) = lower(create_flow.flow_slug)
  ) and exists (
    select 1
    from pgmq.list_queues() as listed
    where lower(listed.queue_name) = lower(create_flow.flow_slug)
  ) then
    raise exception
      'cannot create flow "%": queue "%" is already in use by another owner',
      create_flow.flow_slug, lower(create_flow.flow_slug)
      using errcode = 'unique_violation';
  end if;

  insert into pgflow.flows (flow_slug, opt_max_attempts, opt_base_delay, opt_timeout)
  values (
    create_flow.flow_slug,
    coalesce(max_attempts, 3),
    coalesce(base_delay, 5),
    coalesce(timeout, 60)
  )
  on conflict on constraint flows_pkey
  do update
  set flow_slug = pgflow.flows.flow_slug -- Dummy update
  returning * into v_flow;

  -- Ensure the default queue exists, including for an empty flow. Reuse the
  -- listed queue when it exists under any spelling of the normalized name.
  if not exists (
    select 1
    from pgmq.list_queues() as listed
    where lower(listed.queue_name) = lower(create_flow.flow_slug)
  ) then
    perform pgmq.create(lower(create_flow.flow_slug));
  end if;

  return v_flow;
end;
$$;
-- Modify "delete_flow_and_data" function
CREATE OR REPLACE FUNCTION "pgflow"."delete_flow_and_data" ("p_flow_slug" text) RETURNS void LANGUAGE plpgsql SET "search_path" = '' AS $$
BEGIN
  -- Only an exact pgflow.flows row authorizes destructive queue work: a
  -- nonexistent or wrong-case slug must not drop any queue (#650). The
  -- data deletes below stay exact-match and no-op without the row.
  IF EXISTS (
    SELECT 1 FROM pgflow.flows AS flow WHERE flow.flow_slug = p_flow_slug
  ) THEN
    -- Drop queues and archive tables (pgmq) using persisted routes. Resolve
    -- fresh (no session memo): a memoized spelling can go stale after queues
    -- are dropped or recreated and must not authorize destructive work.
    PERFORM pgmq.drop_queue(pgflow._listed_queue_name(route.queue_name))
    FROM (
      SELECT DISTINCT queue_name
      FROM pgflow.steps
      WHERE flow_slug = p_flow_slug
      UNION
      -- Empty flow: no persisted routes, fall back to the default queue
      SELECT lower(p_flow_slug)
      WHERE NOT EXISTS (
        SELECT 1 FROM pgflow.steps WHERE flow_slug = p_flow_slug
      )
    ) AS route;

    -- The listed spelling resolved above no longer exists after the drop.
    -- Reset the session memo entry to the canonical name so a later recreate
    -- of the same normalized name resolves fresh instead of reusing the stale
    -- mixed-case entry (#650). Same route set as the drop above.
    PERFORM set_config('pgflow.queue_name.' || route.queue_name, route.queue_name, false)
    FROM (
      SELECT DISTINCT queue_name
      FROM pgflow.steps
      WHERE flow_slug = p_flow_slug
      UNION
      SELECT lower(p_flow_slug)
      WHERE NOT EXISTS (
        SELECT 1 FROM pgflow.steps WHERE flow_slug = p_flow_slug
      )
    ) AS route;
  END IF;

  -- Delete all associated data in the correct order (respecting FK constraints)
  DELETE FROM pgflow.step_tasks AS task WHERE task.flow_slug = p_flow_slug;
  DELETE FROM pgflow.step_states AS state WHERE state.flow_slug = p_flow_slug;
  DELETE FROM pgflow.runs AS run WHERE run.flow_slug = p_flow_slug;
  DELETE FROM pgflow.deps AS dep WHERE dep.flow_slug = p_flow_slug;
  DELETE FROM pgflow.steps AS step WHERE step.flow_slug = p_flow_slug;
  DELETE FROM pgflow.flows AS flow WHERE flow.flow_slug = p_flow_slug;
END;
$$;
-- Modify "ensure_flow_compiled" function
CREATE OR REPLACE FUNCTION "pgflow"."ensure_flow_compiled" ("flow_slug" text, "shape" jsonb) RETURNS jsonb LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_lock_key int;
  v_flow_exists boolean;
  v_db_shape jsonb;
  v_differences text[];
  v_is_local boolean;
BEGIN
  -- Generate lock key from the normalized flow identity (deterministic hash)
  v_lock_key := hashtext(lower(ensure_flow_compiled.flow_slug));

  -- Acquire transaction-level advisory lock
  -- Serializes concurrent compilation attempts for same flow
  PERFORM pg_advisory_xact_lock(1, v_lock_key);

  -- 1. Check if flow exists
  SELECT EXISTS(SELECT 1 FROM pgflow.flows AS flow WHERE flow.flow_slug = ensure_flow_compiled.flow_slug)
  INTO v_flow_exists;

  -- 2. If flow missing: compile (both environments)
  IF NOT v_flow_exists THEN
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object('status', 'compiled', 'differences', '[]'::jsonb);
  END IF;

  -- 3. Get current shape from DB
  v_db_shape := pgflow._get_flow_shape(ensure_flow_compiled.flow_slug);

  -- 4. Compare shapes
  v_differences := pgflow._compare_flow_shapes(ensure_flow_compiled.shape, v_db_shape);

  -- 5. If shapes match: return verified
  IF array_length(v_differences, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'verified', 'differences', '[]'::jsonb);
  END IF;

  -- 6. Shapes differ - auto-detect environment via is_local()
  v_is_local := pgflow.is_local();

  -- Local mode is the only destructive branch; production mismatches never
  -- delete data and return mismatch so worker startup fails.
  IF v_is_local THEN
    -- Recompile in local/dev: full deletion + fresh compile
    PERFORM pgflow.delete_flow_and_data(ensure_flow_compiled.flow_slug);
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object('status', 'recompiled', 'differences', to_jsonb(v_differences));
  ELSE
    -- Fail in production
    RETURN jsonb_build_object('status', 'mismatch', 'differences', to_jsonb(v_differences));
  END IF;
END;
$$;
-- Modify "requeue_stalled_tasks" function
CREATE OR REPLACE FUNCTION "pgflow"."requeue_stalled_tasks" () RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET "search_path" = '' AS $$
declare
  result_count int := 0;
  max_requeues constant int := 3;
begin
  -- Find and requeue stalled tasks (where started_at > effective timeout + 30s buffer)
  -- Tasks with requeued_count >= max_requeues will have their message archived
  -- but status left as 'started' for easy identification via requeued_count column
  -- Eligibility requires the parent run AND parent step to still be 'started':
  -- stale rows on failed runs or terminal steps must not be revived (#645).
  with stalled_tasks as (
    select
      st.run_id,
      st.step_slug,
      st.task_index,
      st.message_id,
      st.queue_name,
      r.flow_slug,
      st.requeued_count
    from pgflow.step_tasks st
    join pgflow.runs r on r.run_id = st.run_id
    join pgflow.step_states ss on ss.run_id = st.run_id and ss.step_slug = st.step_slug
    join pgflow.flows f on f.flow_slug = r.flow_slug
    join pgflow.steps s on s.flow_slug = r.flow_slug and s.step_slug = st.step_slug
    where st.status = 'started'
      and r.status = 'started'
      and ss.status = 'started'
      and st.permanently_stalled_at is null
      and st.started_at < now()
        - (coalesce(s.opt_timeout, f.opt_timeout) * interval '1 second')
        - interval '30 seconds'
    for update of st skip locked
  ),
  -- Separate tasks that can be requeued from those that exceeded max requeues
  to_requeue as (
    select * from stalled_tasks where requeued_count < max_requeues
  ),
  to_archive as (
    select * from stalled_tasks where requeued_count >= max_requeues
  ),
  -- Update tasks that will be requeued
  requeued as (
    update pgflow.step_tasks st
    set
      status = 'queued',
      started_at = null,
      last_worker_id = null,
      requeued_count = st.requeued_count + 1,
      last_requeued_at = now()
    from to_requeue tr
    where st.run_id = tr.run_id
      and st.step_slug = tr.step_slug
      and st.task_index = tr.task_index
    returning tr.queue_name as queue_name, tr.message_id
  ),
  -- Make requeued messages visible immediately (batched per queue, through
  -- the tasks' stored queue snapshots resolved to their listed spelling #650)
  visibility_reset as (
    select pgflow.set_vt_batch(
      pgflow._effective_queue_name(r.queue_name),
      array_agg(r.message_id),
      array_agg(0)  -- all offsets are 0 (immediate visibility)
    )
    from requeued r
    where r.message_id is not null
    group by r.queue_name
  ),
  -- Mark tasks as permanently stalled before archiving
  mark_permanently_stalled as (
    update pgflow.step_tasks st
    set permanently_stalled_at = now()
    from to_archive ta
    where st.run_id = ta.run_id
      and st.step_slug = ta.step_slug
      and st.task_index = ta.task_index
    returning st.run_id
  ),
  -- Archive messages for tasks that exceeded max requeues (batched per queue)
  archived as (
    select pgmq.archive(
      pgflow._effective_queue_name(ta.queue_name),
      array_agg(ta.message_id)
    )
    from to_archive ta
    where ta.message_id is not null
    group by ta.queue_name
  ),
  -- Force execution of visibility_reset CTE
  _vr as (select count(*) from visibility_reset),
  -- Force execution of mark_permanently_stalled CTE
  _mps as (select count(*) from mark_permanently_stalled),
  -- Force execution of archived CTE
  _ar as (select count(*) from archived)
  select count(*) into result_count
  from requeued, _vr, _mps, _ar;

  return result_count;
end;
$$;
-- Modify "fail_task" function
CREATE OR REPLACE FUNCTION "pgflow"."fail_task" ("run_id" uuid, "step_slug" text, "task_index" integer, "error_message" text) RETURNS SETOF "pgflow"."step_tasks" LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_run_failed boolean;
  v_step_failed boolean;
  v_step_skipped boolean;
  v_when_exhausted text;
  v_task_exhausted boolean;
  v_flow_slug_for_deps text;
  v_prev_step_status text;
  v_run_status text;
  v_flow_slug text;
  v_archived_queues int;
begin

-- If run is already failed, no retries allowed.
-- Cancellation wins: tasks terminalized by the run failure (failed culprit or
-- cancelled siblings) keep their terminal status. This late callback only
-- archives any still-active message and returns the current row unchanged.
IF EXISTS (SELECT 1 FROM pgflow.runs WHERE pgflow.runs.run_id = fail_task.run_id AND pgflow.runs.status = 'failed') THEN
  PERFORM pgflow._archive_task_message(fail_task.run_id, fail_task.step_slug, fail_task.task_index);

  RETURN QUERY SELECT * FROM pgflow.step_tasks
  WHERE pgflow.step_tasks.run_id = fail_task.run_id
    AND pgflow.step_tasks.step_slug = fail_task.step_slug
    AND pgflow.step_tasks.task_index = fail_task.task_index;
  RETURN;
END IF;

-- Late callback guard: lock run + step rows and use current statuses
-- under lock so concurrent fail_task calls cannot read stale status.
SELECT ss.status, r.status, r.flow_slug INTO v_prev_step_status, v_run_status, v_flow_slug
FROM pgflow.runs r
JOIN pgflow.step_states ss ON ss.run_id = r.run_id
WHERE ss.run_id = fail_task.run_id
  AND ss.step_slug = fail_task.step_slug
FOR UPDATE OF r, ss;

-- Recheck under lock: the run may have failed while this callback waited
-- for the lock (the EXISTS guard above ran before the failure committed).
IF v_run_status = 'failed' THEN
  PERFORM pgflow._archive_task_message(fail_task.run_id, fail_task.step_slug, fail_task.task_index);

  RETURN QUERY SELECT * FROM pgflow.step_tasks
  WHERE pgflow.step_tasks.run_id = fail_task.run_id
    AND pgflow.step_tasks.step_slug = fail_task.step_slug
    AND pgflow.step_tasks.task_index = fail_task.task_index;
  RETURN;
END IF;

IF v_prev_step_status IS NOT NULL AND v_prev_step_status != 'started' THEN
  -- Archive the task message if present, through the task's stored queue
  -- snapshot (#650)
  PERFORM pgflow._archive_task_message(fail_task.run_id, fail_task.step_slug, fail_task.task_index);

  RETURN QUERY SELECT * FROM pgflow.step_tasks
  WHERE pgflow.step_tasks.run_id = fail_task.run_id
    AND pgflow.step_tasks.step_slug = fail_task.step_slug
    AND pgflow.step_tasks.task_index = fail_task.task_index;
  RETURN;
END IF;

WITH flow_info AS (
  SELECT r.flow_slug
  FROM pgflow.runs r
  WHERE r.run_id = fail_task.run_id
),
  config AS (
  SELECT
    COALESCE(s.opt_max_attempts, f.opt_max_attempts) AS opt_max_attempts,
    COALESCE(s.opt_base_delay, f.opt_base_delay) AS opt_base_delay,
    s.when_exhausted
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
 -- Determine if task exhausted retries and get when_exhausted mode
 task_status AS (
   SELECT
     (select status from fail_or_retry_task) AS new_task_status,
     (select when_exhausted from config) AS when_exhausted_mode,
    -- Task is exhausted when it's failed (no more retries)
    ((select status from fail_or_retry_task) = 'failed') AS is_exhausted
),
maybe_fail_step AS (
  UPDATE pgflow.step_states
  SET
     -- Status logic:
     -- - If task not exhausted (retrying): keep current status
     -- - If exhausted AND when_exhausted='fail': set to 'failed'
     -- - If exhausted AND when_exhausted IN ('skip', 'skip-cascade'): set to 'skipped'
     status = CASE
              WHEN NOT (select is_exhausted from task_status) THEN pgflow.step_states.status
              WHEN (select when_exhausted_mode from task_status) = 'fail' THEN 'failed'
              ELSE 'skipped'  -- skip or skip-cascade
              END,
    failed_at = CASE
                 WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) = 'fail' THEN now()
                 ELSE NULL
                 END,
    error_message = CASE
                    WHEN (select is_exhausted from task_status) THEN fail_task.error_message
                    ELSE NULL
                    END,
    skip_reason = CASE
                  WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) IN ('skip', 'skip-cascade') THEN 'handler_failed'
                  ELSE pgflow.step_states.skip_reason
                  END,
    skipped_at = CASE
                 WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) IN ('skip', 'skip-cascade') THEN now()
                 ELSE pgflow.step_states.skipped_at
                 END,
    -- Clear remaining_tasks when skipping (required by remaining_tasks_state_consistency constraint)
    remaining_tasks = CASE
                      WHEN (select is_exhausted from task_status) AND (select when_exhausted_mode from task_status) IN ('skip', 'skip-cascade') THEN NULL
                      ELSE pgflow.step_states.remaining_tasks
                      END
  FROM fail_or_retry_task
  WHERE pgflow.step_states.run_id = fail_task.run_id
    AND pgflow.step_states.step_slug = fail_task.step_slug
  RETURNING pgflow.step_states.*
),
run_update AS (
  -- Update run status: only fail when when_exhausted='fail' and step was failed
  UPDATE pgflow.runs
  SET status = CASE
               WHEN (select status from maybe_fail_step) = 'failed' THEN 'failed'
               ELSE status
               END,
      failed_at = CASE
                  WHEN (select status from maybe_fail_step) = 'failed' THEN now()
                  ELSE NULL
                  END,
      -- Decrement remaining_steps only on FIRST transition to skipped
      -- (not when step was already skipped and a second task fails)
      -- Uses PL/pgSQL variable captured before CTE chain
      remaining_steps = CASE
                        WHEN (select status from maybe_fail_step) = 'skipped'
                             AND v_prev_step_status != 'skipped'
                        THEN pgflow.runs.remaining_steps - 1
                        ELSE pgflow.runs.remaining_steps
                        END
  WHERE pgflow.runs.run_id = fail_task.run_id
  RETURNING pgflow.runs.status
)
SELECT
  COALESCE((SELECT status = 'failed' FROM run_update), false),
  COALESCE((SELECT status = 'failed' FROM maybe_fail_step), false),
  COALESCE((SELECT status = 'skipped' FROM maybe_fail_step), false),
  COALESCE((SELECT is_exhausted FROM task_status), false)
INTO v_run_failed, v_step_failed, v_step_skipped, v_task_exhausted;

 -- Capture when_exhausted mode for later skip handling
 SELECT s.when_exhausted INTO v_when_exhausted
 FROM pgflow.steps s
JOIN pgflow.runs r ON r.flow_slug = s.flow_slug
 WHERE r.run_id = fail_task.run_id
   AND s.step_slug = fail_task.step_slug;

-- Send broadcast event for step failure if the step was failed
IF v_task_exhausted AND v_step_failed THEN
  PERFORM realtime.send(
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
  );
END IF;

-- Handle step skipping (when_exhausted = 'skip' or 'skip-cascade')
 IF v_task_exhausted AND v_step_skipped THEN
  -- Lock-order invariant: always lock/update step_tasks before PGMQ queue rows.
  -- requeue_stalled_tasks() uses the same order; archiving queue rows first
  -- deadlocks the two transactions against each other.
  -- Terminalize all still-active sibling task rows for the skipped step, then
  -- archive their messages batched per stored queue route (#650); the
  -- archive reads the terminalized rows through the CTE.
  WITH skipped_tasks AS (
    UPDATE pgflow.step_tasks AS task
    SET status = 'skipped'
    WHERE task.run_id = fail_task.run_id
      AND task.step_slug = fail_task.step_slug
      AND task.status IN ('queued', 'started')
    RETURNING task.message_id, task.queue_name
  ),
  archived_messages AS (
    SELECT pgmq.archive(
      pgflow._effective_queue_name(st.queue_name),
      ARRAY_AGG(st.message_id)
    )
    FROM skipped_tasks st
    WHERE st.message_id IS NOT NULL
    GROUP BY st.queue_name
  )
  SELECT COUNT(*)::int INTO v_archived_queues
  FROM archived_messages;

  -- Send broadcast event for step skipped
  PERFORM realtime.send(
    jsonb_build_object(
      'event_type', 'step:skipped',
      'run_id', fail_task.run_id,
      'step_slug', fail_task.step_slug,
      'status', 'skipped',
      'skip_reason', 'handler_failed',
      'error_message', fail_task.error_message,
      'skipped_at', now()
    ),
    concat('step:', fail_task.step_slug, ':skipped'),
    concat('pgflow:run:', fail_task.run_id),
    false
  );

   -- For skip-cascade: cascade skip to all downstream dependents
   IF v_when_exhausted = 'skip-cascade' THEN
    PERFORM pgflow._cascade_force_skip_steps(fail_task.run_id, fail_task.step_slug, 'handler_failed');
  ELSE
    -- For plain 'skip': decrement remaining_deps on dependent steps
    -- (This mirrors the pattern in cascade_resolve_conditions.sql for when_unmet='skip')
    SELECT flow_slug INTO v_flow_slug_for_deps
    FROM pgflow.runs
    WHERE pgflow.runs.run_id = fail_task.run_id;

    UPDATE pgflow.step_states AS child_state
    SET remaining_deps = child_state.remaining_deps - 1,
        -- If child is a map step and this skipped step is its only dependency,
        -- set initial_tasks = 0 (skipped dep = empty array)
        initial_tasks = CASE
          WHEN child_step.step_type = 'map' AND child_step.deps_count = 1 THEN 0
          ELSE child_state.initial_tasks
        END
    FROM pgflow.deps AS dep
    JOIN pgflow.steps AS child_step ON child_step.flow_slug = dep.flow_slug AND child_step.step_slug = dep.step_slug
    WHERE child_state.run_id = fail_task.run_id
      AND dep.flow_slug = v_flow_slug_for_deps
      AND dep.dep_slug = fail_task.step_slug
      AND child_state.step_slug = dep.step_slug;

    -- Evaluate conditions on newly-ready dependent steps
    -- This must happen before cascade_complete_taskless_steps so that
    -- skipped steps can set initial_tasks=0 for their map dependents
    IF NOT pgflow.cascade_resolve_conditions(fail_task.run_id) THEN
      -- Run was failed due to a condition with when_unmet='fail'
      -- Archive the failed task's message before returning
      PERFORM pgflow._archive_task_message(fail_task.run_id, fail_task.step_slug, fail_task.task_index);
      -- Return the task row (API contract)
      RETURN QUERY SELECT * FROM pgflow.step_tasks
      WHERE pgflow.step_tasks.run_id = fail_task.run_id
        AND pgflow.step_tasks.step_slug = fail_task.step_slug
        AND pgflow.step_tasks.task_index = fail_task.task_index;
      RETURN;
    END IF;

    -- Auto-complete taskless steps (e.g., map steps with initial_tasks=0 from skipped dep)
    PERFORM pgflow.cascade_complete_taskless_steps(fail_task.run_id);

    -- Start steps that became ready after condition resolution and taskless completion
    PERFORM pgflow.start_ready_steps(fail_task.run_id);
  END IF;

  -- Try to complete the run (remaining_steps may now be 0)
  PERFORM pgflow.maybe_complete_run(fail_task.run_id);
END IF;

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

-- Terminalize unfinished tasks as cancelled when the run fails, then archive
-- their messages batched per stored queue route (#650). Lock-order invariant:
-- always lock/update step_tasks before PGMQ queue rows; the archive reads the
-- terminalized rows through the CTE. The culprit task is already terminal
-- (failed or requeued by fail_or_retry_task), so only unfinished queued/started
-- siblings are cancelled.
IF v_run_failed THEN
  WITH cancelled_tasks AS (
    UPDATE pgflow.step_tasks AS task
    SET status = 'cancelled'
    WHERE task.run_id = fail_task.run_id
      AND task.status IN ('queued', 'started')
    RETURNING task.message_id, task.queue_name
  ),
  archived_messages AS (
    SELECT pgmq.archive(
      pgflow._effective_queue_name(ct.queue_name),
      ARRAY_AGG(ct.message_id)
    )
    FROM cancelled_tasks ct
    WHERE ct.message_id IS NOT NULL
    GROUP BY ct.queue_name
  )
  SELECT COUNT(*)::int INTO v_archived_queues
  FROM archived_messages;
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
      st.queue_name,
      st.message_id,
      pgflow.calculate_retry_delay((SELECT base_delay FROM retry_config), st.attempts_count) AS calculated_delay
    FROM pgflow.step_tasks st
    JOIN pgflow.runs r ON st.run_id = r.run_id
    WHERE st.run_id = fail_task.run_id
      AND st.step_slug = fail_task.step_slug
      AND st.task_index = fail_task.task_index
      AND st.status = 'queued'
  )
  SELECT pgmq.set_vt(
    pgflow._effective_queue_name(qt.queue_name),
    qt.message_id,
    qt.calculated_delay
  )
  FROM queued_tasks qt
  WHERE EXISTS (SELECT 1 FROM queued_tasks)
);

-- For failed tasks: archive the message, through the task's stored queue
-- snapshot (#650)
PERFORM pgmq.archive(pgflow._effective_queue_name(st.queue_name), ARRAY_AGG(st.message_id))
FROM pgflow.step_tasks st
WHERE st.run_id = fail_task.run_id
  AND st.step_slug = fail_task.step_slug
  AND st.task_index = fail_task.task_index
  AND st.status = 'failed'
  AND st.message_id IS NOT NULL
GROUP BY st.queue_name
HAVING COUNT(st.message_id) > 0;

return query select *
from pgflow.step_tasks st
where st.run_id = fail_task.run_id
  and st.step_slug = fail_task.step_slug
  and st.task_index = fail_task.task_index;

end;
$$;
-- Create "start_tasks" function
CREATE FUNCTION "pgflow"."start_tasks" ("flow_slug" text, "msg_ids" bigint[], "worker_id" uuid, "queue_name" text DEFAULT NULL::text) RETURNS SETOF "pgflow"."step_task_record" LANGUAGE sql SET "search_path" = '' AS $$
with task_candidates as (
    select
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.message_id
    from pgflow.step_tasks as task
    join pgflow.runs r on r.run_id = task.run_id
    where task.flow_slug = start_tasks.flow_slug
      and task.queue_name = lower(coalesce(start_tasks.queue_name, start_tasks.flow_slug))
      and task.message_id = any(msg_ids)
      and task.status = 'queued'
      and r.status = 'started'
      and exists (
        select 1
        from pgflow.step_states ss
        where ss.run_id = task.run_id
          and ss.step_slug = task.step_slug
          and ss.status = 'started'
      )
  ),
  -- Claim rows with a guarded update and return only what was actually
  -- claimed. A concurrent skip can win the row lock between the candidate
  -- select and this update; the status = 'queued' recheck then claims nothing,
  -- so no stale candidate row must escape to the worker (#638).
  tasks as (
    update pgflow.step_tasks
    set
      attempts_count = attempts_count + 1,
      status = 'started',
      started_at = now(),
      last_worker_id = worker_id
    from task_candidates as candidate
    where step_tasks.message_id = candidate.message_id
      and step_tasks.flow_slug = candidate.flow_slug
      and step_tasks.queue_name = lower(coalesce(start_tasks.queue_name, start_tasks.flow_slug))
      and step_tasks.status = 'queued'
    returning
      step_tasks.flow_slug,
      step_tasks.run_id,
      step_tasks.step_slug,
      step_tasks.task_index,
      step_tasks.message_id
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
      -- Read output directly from step_states (already aggregated by writers)
      dep_state.output as dep_output
    from tasks st
    join pgflow.deps dep on dep.flow_slug = st.flow_slug and dep.step_slug = st.step_slug
    join pgflow.step_states dep_state on
      dep_state.run_id = st.run_id and
      dep_state.step_slug = dep.dep_slug and
      dep_state.status = 'completed'  -- Only include completed deps (not skipped)
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
  -- Batch update visibility timeouts for all messages.
  -- The final statement must force this CTE to run: an unreferenced SELECT
  -- CTE is not guaranteed to execute, which would leave a claimed task with
  -- only the shorter initial PGMQ read visibility (#656).
  visibility_reset as (
    select pgflow.set_vt_batch(
      pgflow._effective_queue_name(
        lower(coalesce(start_tasks.queue_name, start_tasks.flow_slug))
      ),
      array_agg(t.message_id order by t.message_id),
      array_agg(t.vt_delay order by t.message_id)
    )
    from timeouts t
  ),
  -- Force execution of the visibility_reset CTE (same pattern as
  -- requeue_stalled_tasks) and guard completeness: set_vt_batch updates
  -- only queue rows it finds, so fewer returned rows than claimed tasks
  -- means a visibility extension did not run (#656). SQL functions cannot
  -- RAISE, so the mismatch branch casts a descriptive message to int4:
  -- the cast error fails the whole statement, rolling back the task
  -- transition and attempt increment, and returns nothing.
  _vr as (
    select case
      when updated.updated_count = claimed.claimed_count then updated.updated_count
      else format(
          'start_tasks(): visibility updated %s of %s claimed messages',
          updated.updated_count,
          claimed.claimed_count
        )::int4
    end as visibility_updates
    from (select count(*) as updated_count from visibility_reset) as updated
    cross join (select count(*) as claimed_count from tasks) as claimed
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
      -- Regular (non-map) steps receive dependency outputs as a structured object.
      -- Root steps (no dependencies) get empty object - they access flowInput via context.
      -- Dependent steps get only their dependency outputs.
      ELSE
        -- Non-map steps get structured input with dependency keys only
        -- Example for dependent step: {
        --   "step1": {"output": "from_step1"},
        --   "step2": {"output": "from_step2"}
        -- }
        -- Example for root step: {}
        --
        -- Note: flow_input is available separately in the returned record
        -- for workers to access via context.flowInput
        coalesce(dep_out.deps_output, '{}'::jsonb)
    END as input,
    st.message_id as msg_id,
    st.task_index as task_index,
    -- flow_input: Original run input for worker context
    -- Only included for root non-map steps to avoid data duplication.
    -- Root map steps: flowInput IS the array, useless to include
    -- Dependent steps: lazy load via ctx.flowInput when needed
    CASE
      WHEN step.step_type != 'map' AND step.deps_count = 0
      THEN r.input
      ELSE NULL
    END as flow_input
  from tasks st
  join runs r on st.run_id = r.run_id
  join pgflow.steps step on
    step.flow_slug = st.flow_slug and
    step.step_slug = st.step_slug
  left join deps_outputs dep_out on
    dep_out.run_id = st.run_id and
    dep_out.step_slug = st.step_slug
  cross join _vr
  where _vr.visibility_updates >= 0
$$;
-- Drop "start_tasks" function
DROP FUNCTION "pgflow"."start_tasks" (text, bigint[], uuid);

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
    -- Exhaustion: attempts_count reached max_attempts, or stalled-task
    -- recovery gave up on the task (permanently_stalled_at set). A marked
    -- task exhausts regardless of its remaining attempts: its message was
    -- archived, so a retry could never be delivered. attempts_count stays
    -- untouched; it records committed claims (#689).
    status = CASE
      WHEN task.permanently_stalled_at IS NULL
        AND task.attempts_count < (SELECT opt_max_attempts FROM config) THEN 'queued'
      ELSE 'failed'
    END,
    failed_at = CASE
      WHEN task.permanently_stalled_at IS NULL
        AND task.attempts_count < (SELECT opt_max_attempts FROM config) THEN NULL
      ELSE now()
    END,
    started_at = CASE
      WHEN task.permanently_stalled_at IS NULL
        AND task.attempts_count < (SELECT opt_max_attempts FROM config) THEN NULL
      ELSE task.started_at
    END,
    error_message = fail_task.error_message
  WHERE task.run_id = fail_task.run_id
    AND task.step_slug = fail_task.step_slug
    AND task.task_index = fail_task.task_index
    AND (
      task.status = 'started'
      -- Marked queued leftovers from older callbacks: terminalize them too.
      -- Ordinary unmarked queued tasks stay unchanged (a recovery requeue
      -- owns their next attempt).
      OR (task.status = 'queued' AND task.permanently_stalled_at IS NOT NULL)
    )
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
      st.queue_name,
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
      ct.queue_name,
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
    qt.queue_name,
    qt.message_id,
    qt.calculated_delay
  )
  FROM queued_tasks qt
  WHERE EXISTS (SELECT 1 FROM queued_tasks)
);

-- For failed tasks: archive the message, through the task's stored queue
-- snapshot (#650)
PERFORM pgmq.archive(st.queue_name, ARRAY_AGG(st.message_id))
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
-- Create "escalate_permanently_stalled" function
CREATE FUNCTION "pgflow"."escalate_permanently_stalled" () RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET "search_path" = '' AS $$
declare
  v_candidate record;
  v_run_status text;
  v_step_status text;
  v_task_status text;
  v_stalled_at timestamptz;
  v_requeued_count int;
  v_escalated int := 0;
begin
  -- Pick up every marked nonterminal task, including marked queued leftovers
  -- requeued by older callbacks and rows stamped by earlier deployments
  for v_candidate in
    select
      st.run_id,
      st.step_slug,
      st.task_index
    from pgflow.step_tasks st
    where st.status in ('started', 'queued')
      and st.permanently_stalled_at is not null
    order by st.run_id, st.step_slug, st.task_index
  loop
    -- Lock and recheck the run and step: if either left 'started', that
    -- transition owns the task's terminal state and escalation must not
    -- fight it
    select r.status, step_state.status into v_run_status, v_step_status
    from pgflow.runs r
    join pgflow.step_states step_state on step_state.run_id = r.run_id
    where r.run_id = v_candidate.run_id
      and step_state.step_slug = v_candidate.step_slug
    for update of r, step_state;

    if v_run_status = 'started' and v_step_status = 'started' then
      -- Lock and recheck the task: recovery or a live callback may have
      -- transitioned it while this pass waited for the run and step locks
      select st.status, st.permanently_stalled_at, st.requeued_count
      into v_task_status, v_stalled_at, v_requeued_count
      from pgflow.step_tasks st
      where st.run_id = v_candidate.run_id
        and st.step_slug = v_candidate.step_slug
        and st.task_index = v_candidate.task_index
      for update;

      if v_task_status in ('started', 'queued') and v_stalled_at is not null then
        -- fail_task() treats the marker as exhaustion and applies
        -- when_exhausted; attempts_count stays untouched (#689)
        perform pgflow.fail_task(
          run_id => v_candidate.run_id,
          step_slug => v_candidate.step_slug,
          task_index => v_candidate.task_index,
          error_message => 'permanently stalled: worker did not report after '
            || v_requeued_count || ' requeues'
        );
        v_escalated := v_escalated + 1;
      end if;
    end if;
  end loop;

  return v_escalated;
end;
$$;
-- Modify "setup_requeue_stalled_tasks_cron" function
CREATE OR REPLACE FUNCTION "pgflow"."setup_requeue_stalled_tasks_cron" ("cron_interval" text DEFAULT '15 seconds') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET "search_path" = pgflow, cron, pg_temp AS $$
declare
  job_id bigint;
  escalate_job_id bigint;
begin
  -- Remove existing jobs if any
  begin
    perform cron.unschedule('pgflow_requeue_stalled_tasks');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('pgflow_escalate_permanently_stalled');
  exception
    when others then null;
  end;

  -- Schedule the recovery job
  job_id := cron.schedule(
    job_name => 'pgflow_requeue_stalled_tasks',
    schedule => setup_requeue_stalled_tasks_cron.cron_interval,
    command => 'select pgflow.requeue_stalled_tasks()'
  );

  -- Schedule escalation as its own job and transaction. The jobs may overlap;
  -- recovery locks step_tasks first, while fail_task() locks the run and step
  -- first (#689). Separate transactions release recovery locks before the next
  -- escalation sweep, whose candidate rows are rechecked under lock.
  escalate_job_id := cron.schedule(
    job_name => 'pgflow_escalate_permanently_stalled',
    schedule => setup_requeue_stalled_tasks_cron.cron_interval,
    command => 'select pgflow.escalate_permanently_stalled()'
  );

  return format(
    'Scheduled pgflow_requeue_stalled_tasks (every %s, job_id=%s) and pgflow_escalate_permanently_stalled (job_id=%s)',
    setup_requeue_stalled_tasks_cron.cron_interval,
    job_id,
    escalate_job_id
  );
end;
$$;
-- Set comment to function: "setup_requeue_stalled_tasks_cron"
COMMENT ON FUNCTION "pgflow"."setup_requeue_stalled_tasks_cron" IS 'Sets up cron jobs to automatically recover and terminalize stalled tasks.
Schedules pgflow_requeue_stalled_tasks and pgflow_escalate_permanently_stalled
at the specified cron_interval (default: 15 seconds).
Escalation runs as a separate job so recovery commits before fail_task()
locks are taken (#689).
Replaces existing jobs if they exist (idempotent).
Returns a confirmation message with job IDs.';

-- Atlas cannot express this transition: schedule escalation only where
-- scheduled recovery already exists. When recovery is enabled, an operator's
-- custom recovery interval is preserved by copying the installed schedule
-- instead of resetting it, and a paused recovery job stays paused for
-- escalation too (documented Atlas data-transition patch, #689).
SELECT cron.schedule(
  job_name => 'pgflow_escalate_permanently_stalled',
  schedule => (
    SELECT cron.job.schedule
    FROM cron.job
    WHERE cron.job.jobname = 'pgflow_requeue_stalled_tasks'
  ),
  command => 'select pgflow.escalate_permanently_stalled()'
)
WHERE EXISTS (
  SELECT 1 FROM cron.job
  WHERE cron.job.jobname = 'pgflow_requeue_stalled_tasks'
);

-- cron.schedule() always creates an active job; mirror the recovery job's
-- paused state onto escalation so an upgrade cannot resume paused recovery
-- through the back door.
SELECT cron.alter_job(
  job_id => escalation.jobid,
  active => recovery.active
)
FROM cron.job escalation
JOIN cron.job recovery ON recovery.jobname = 'pgflow_requeue_stalled_tasks'
WHERE escalation.jobname = 'pgflow_escalate_permanently_stalled';

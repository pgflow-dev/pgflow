-- Claim queued tasks for the given flow by persisted (queue_name, message_id)
-- identity (#650), extended with the exact step selector (#651).
--
-- queue_name is the canonical queue identity of the polled queue and is
-- required: there is no default and no flow_slug fallback, so a claim can
-- never target a queue the caller did not read from. Today every plain-flow
-- caller passes lower(flow_slug) — the spelling tasks store — including when
-- PGMQ still lists the queue under an older mixed-case spelling: PGMQ's
-- message API normalizes names itself, but this match is exact against the
-- stored canonical snapshot, so the polled mixed-case spelling would match
-- nothing. An explicit NULL matches nothing (no silent fallback).
--
-- step_slug is the additive exact step selector (#651), defined by the
-- persisted queue mode:
-- - step mode: a non-null exact step_slug is required and must map to the
--   supplied queue. A missing, unknown, wrong-case, or wrong-route selector
--   never becomes a flow-wide claim and must not mutate tasks or messages.
-- - flow mode: no selector means the existing flow-wide claim on the
--   explicit default queue. A supplied selector is rejected rather than
--   silently changing plain-flow semantics.
-- These checks apply to direct SQL callers as well as workers; worker
-- config alone is not the enforcement boundary. Validation runs once per
-- call through a single combined mode-and-route probe before the claim
-- query, and a rejected claim fails the whole statement before any task or
-- message is touched.
create or replace function pgflow.start_tasks(
  flow_slug text,
  msg_ids bigint [],
  worker_id uuid,
  queue_name text,
  step_slug text default null
)
returns setof pgflow.step_task_record
volatile
set search_path to ''
-- plpgsql caches statement plans and switches to generic plans after five
-- executions. The generic claim plan drives task_candidates from a runs scan
-- and filters every queued task of the run instead of probing the
-- (queue_name, message_id) index: claims in one long-lived worker session
-- degrade quadratically with the backlog and can take minutes on large
-- flows. Force custom plans so every claim uses the exact msg_ids index;
-- per-call replanning costs a fraction of a millisecond (#651).
set plan_cache_mode = 'force_custom_plan'
language plpgsql
as $$
DECLARE
  v_queue_mode text;
  v_route_exists boolean;
BEGIN
  -- One combined pre-claim probe (#651): the queue mode and, in step mode,
  -- whether the exact (flow_slug, step_slug, queue_name) route persists.
  -- Keeping this to a single statement avoids an extra lookup on the claim
  -- hot path without weakening the exact-selector checks below; in flow
  -- mode with no selector the route EXISTS() is not evaluated at all.
  SELECT flow.queue_mode, EXISTS (
    SELECT 1
    FROM pgflow.steps AS s
    WHERE s.flow_slug = start_tasks.flow_slug
      AND s.step_slug = start_tasks.step_slug
      AND s.queue_name = start_tasks.queue_name
  )
  INTO v_queue_mode, v_route_exists
  FROM pgflow.flows AS flow
  WHERE flow.flow_slug = start_tasks.flow_slug;

  IF v_queue_mode IS NULL THEN
    -- Unknown flow: nothing claimable (preserves the empty-result behavior)
    RETURN;
  END IF;

  IF v_queue_mode = 'step' THEN
    IF start_tasks.step_slug IS NULL THEN
      RAISE EXCEPTION
        'Flow "%" uses per-step queues: an exact step_slug is required to claim tasks.',
        start_tasks.flow_slug
        USING detail = format(
          'Queue "%s" is a private step queue; a claim without a step selector could mix steps.',
          start_tasks.queue_name
        ),
        hint = 'Pass the exact step_slug of the polled step; direct SQL cannot obtain flow-wide claims in step mode.';
    END IF;

    IF NOT v_route_exists THEN
      RAISE EXCEPTION
        'Step "%" does not route to queue "%" in flow "%".',
        start_tasks.step_slug, start_tasks.queue_name, start_tasks.flow_slug
        USING detail = 'The step selector must match a persisted step route (flow_slug, step_slug, queue_name) exactly.',
        hint = 'Poll the queue recorded for this step and pass its exact canonical name and spelling.';
    END IF;
  ELSIF start_tasks.step_slug IS NOT NULL THEN
    RAISE EXCEPTION
      'Flow "%" uses the default flow queue: a step selector is not allowed.',
      start_tasks.flow_slug
      USING detail = format(
        'Step "%s" was supplied, but flow queue mode has no per-step queues.',
        start_tasks.step_slug
      ),
      hint = 'Omit step_slug to claim flow-wide tasks.';
  END IF;

  RETURN QUERY
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
      and task.queue_name = start_tasks.queue_name
      and (start_tasks.step_slug IS NULL OR task.step_slug = start_tasks.step_slug)
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
      and step_tasks.queue_name = start_tasks.queue_name
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
      start_tasks.queue_name,
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
      -- Root steps (no dependencies) get empty object - they access flow_input via context.
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
  where _vr.visibility_updates >= 0;
END;
$$;

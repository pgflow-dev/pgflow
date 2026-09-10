-- Deletes a flow and all its associated data
-- WARNING: This is destructive - deletes flow definition AND all runtime data
-- Used by ensure_flow_compiled for development mode recompilation
--
-- #650 lock order: canonical advisory lock, concrete flow row, runtime rows
-- (runs, step states, tasks in (run_id, step_slug, task_index) order), then
-- the pgmq.meta topology fence, then physical queue table locks. Ownership is
-- retained until every validated queue is dropped; the flow identity row is
-- deleted last.
create or replace function pgflow.delete_flow_and_data(p_flow_slug text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
DECLARE
  v_route text[];
  v_route_names text[];
  v_metadata_names text[];
  v_snapshot_violation record;
  v_queue text;
  v_qtable text;
  v_atable text;
  v_sequence text;
  v_inspect_result jsonb;
  v_idx int;
BEGIN
  PERFORM pg_advisory_xact_lock(1, hashtext(lower(p_flow_slug)));

  -- Retain and lock the concrete identity; reject a missing flow
  IF NOT EXISTS (
    SELECT 1 FROM pgflow.flows f
    WHERE f.flow_slug = p_flow_slug
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Flow % does not exist', p_flow_slug;
  END IF;

  -- Runtime locks in the established order, before any queue/metadata access
  PERFORM 1 FROM pgflow.runs r
  WHERE r.flow_slug = p_flow_slug
  ORDER BY r.run_id
  FOR UPDATE;

  PERFORM 1 FROM pgflow.step_states s
  WHERE s.flow_slug = p_flow_slug
  ORDER BY s.run_id, s.step_slug
  FOR UPDATE;

  PERFORM 1 FROM pgflow.step_tasks t
  WHERE t.flow_slug = p_flow_slug
  ORDER BY t.run_id, t.step_slug, t.task_index
  FOR UPDATE;

  -- Topology fence after runtime locks (never the reverse order)
  LOCK TABLE pgmq.meta IN SHARE ROW EXCLUSIVE MODE;

  -- Capture the complete private route: persisted steps plus the default for
  -- an empty plain flow. An unprovisioned definition-only flow is not
  -- permission to drop a same-named resource; _inspect_generated_queue
  -- rejects that below.
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT s.queue_name ORDER BY s.queue_name),
    ARRAY[lower(p_flow_slug)]
  ) INTO v_route
  FROM pgflow.steps s
  WHERE s.flow_slug = p_flow_slug;

  -- Validate every task snapshot against the captured route
  SELECT t.run_id, t.step_slug, t.task_index, t.queue_name
  INTO v_snapshot_violation
  FROM pgflow.step_tasks t
  WHERE t.flow_slug = p_flow_slug
    AND NOT (t.queue_name = ANY(v_route))
  ORDER BY t.run_id, t.step_slug, t.task_index
  LIMIT 1;

  IF v_snapshot_violation IS NOT NULL THEN
    RAISE EXCEPTION 'Flow %: task %/%/% snapshot queue "%" is outside the validated private route; refusing deletion',
      p_flow_slug,
      v_snapshot_violation.run_id,
      v_snapshot_violation.step_slug,
      v_snapshot_violation.task_index,
      v_snapshot_violation.queue_name;
  END IF;

  v_route_names := v_route;
  v_metadata_names := ARRAY[]::text[];

  -- Resolve exact metadata spelling and physical validity per route queue;
  -- this also rejects missing, ambiguous, malformed, or differently owned
  -- resources instead of dropping an uncertain physical queue.
  FOR v_idx IN 1..COALESCE(array_length(v_route, 1), 0)
  LOOP
    v_queue := v_route[v_idx];
    v_inspect_result := pgflow._inspect_generated_queue(p_flow_slug, v_queue, true);

    -- Lock the validated physical queue/archive tables before mutation
    EXECUTE format(
      'LOCK TABLE pgmq.%I, pgmq.%I IN ACCESS EXCLUSIVE MODE',
      pgmq.format_table_name(v_queue, 'q'),
      pgmq.format_table_name(v_queue, 'a')
    );

    -- Recheck ownership/shape after the physical locks are held
    v_inspect_result := pgflow._inspect_generated_queue(p_flow_slug, v_queue, true);

    -- Remember the exact metadata spelling for the drop below: the flow row
    -- and step definitions may be gone by then.
    v_metadata_names[v_idx] := v_inspect_result ->> 'metadata_name';
  END LOOP;

  -- Delete runtime rows and step definitions in FK order while retaining the
  -- flow identity and captured validated queue names
  DELETE FROM pgflow.step_tasks AS task WHERE task.flow_slug = p_flow_slug;
  DELETE FROM pgflow.step_states AS state WHERE state.flow_slug = p_flow_slug;
  DELETE FROM pgflow.runs AS run WHERE run.flow_slug = p_flow_slug;
  DELETE FROM pgflow.deps AS dep WHERE dep.flow_slug = p_flow_slug;
  DELETE FROM pgflow.steps AS step WHERE step.flow_slug = p_flow_slug;

  -- Drop each validated private queue using its exact metadata spelling.
  -- No per-message archival/deletion happens before the whole-queue drop.
  FOR v_idx IN 1..COALESCE(array_length(v_route_names, 1), 0)
  LOOP
    v_queue := v_route_names[v_idx];
    v_qtable := pgmq.format_table_name(v_queue, 'q');
    v_atable := pgmq.format_table_name(v_queue, 'a');
    v_sequence := v_qtable || '_msg_id_seq';

    PERFORM pgmq.drop_queue(v_metadata_names[v_idx]);

    -- Post-drop completeness: pgmq.drop_queue must have removed the
    -- metadata row, both physical tables, and the identity sequence. A
    -- partial drop leaves the namespace ambiguous and must abort before
    -- the flow identity row is deleted.
    IF EXISTS (
      SELECT 1 FROM pgmq.meta m WHERE lower(m.queue_name) = v_queue
    ) THEN
      RAISE EXCEPTION 'Flow %: dropping generated queue "%" left its PGMQ metadata behind; deletion aborted with everything rolled back',
        p_flow_slug, v_queue;
    END IF;

    IF to_regclass(format('pgmq.%I', v_qtable)) IS NOT NULL
       OR to_regclass(format('pgmq.%I', v_atable)) IS NOT NULL
       OR to_regclass(format('pgmq.%I', v_sequence)) IS NOT NULL THEN
      RAISE EXCEPTION 'Flow %: dropping generated queue "%" left physical objects behind (queue table: %, archive table: %, sequence: %); deletion aborted with everything rolled back',
        p_flow_slug, v_queue, v_qtable, v_atable, v_sequence;
    END IF;
  END LOOP;

  -- Delete the concrete flow identity row last
  DELETE FROM pgflow.flows AS flow WHERE flow.flow_slug = p_flow_slug;
END;
$$;

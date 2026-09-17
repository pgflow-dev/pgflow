-- Deletes a flow and all its associated data
-- WARNING: This is destructive - deletes flow definition AND all runtime data
-- Used by ensure_flow_compiled for development mode recompilation
--
-- The dropped queue set is mode-aware (#651): a flow-mode definition drops
-- its persisted step routes plus the default queue (covering an empty
-- flow); a step-mode definition drops exactly its persisted step routes
-- and never an unrelated default-name queue. Queues created by older
-- releases keep their original listed spelling: drop_queue addresses
-- physical objects, so the drop resolves the spelling fresh through
-- pgmq.list_queues() (_listed_queue_name) and an ambiguous match is
-- rejected before any destructive work. Everything runs in one transaction:
-- a failed PGMQ operation rolls the whole deletion back.
create or replace function pgflow.delete_flow_and_data(p_flow_slug text)
returns void
language plpgsql
volatile
set search_path to ''
as $$
DECLARE
  v_queue_mode text;
BEGIN
  -- Serialize with ensure_flow_compiled and every other definition writer on
  -- the same normalized flow identity (#651): deletion must not interleave
  -- with a concurrent compilation of the same flow. Re-entrant under
  -- ensure_flow_compiled's lock (local recompilation deletes before it
  -- recompiles); taken before any table or queue access.
  PERFORM pg_advisory_xact_lock(1, hashtext(lower(delete_flow_and_data.p_flow_slug)));

  -- Only an exact pgflow.flows row authorizes destructive queue work: a
  -- nonexistent or wrong-case slug must not drop any queue (#650). The
  -- data deletes below stay exact-match and no-op without the row.
  SELECT flow.queue_mode INTO v_queue_mode
  FROM pgflow.flows AS flow
  WHERE flow.flow_slug = p_flow_slug;

  IF v_queue_mode IS NOT NULL THEN
    -- Drop queues and archive tables (pgmq) using persisted routes. The
    -- listed spelling is resolved fresh on every call; message operations
    -- never need it because PGMQ normalizes names itself.
    PERFORM pgmq.drop_queue(pgflow._listed_queue_name(route.queue_name))
    FROM (
      SELECT DISTINCT queue_name
      FROM pgflow.steps
      WHERE flow_slug = p_flow_slug
      UNION
      -- Flow mode also owns the default queue, including for an empty
      -- flow with no persisted routes. Step mode never touches it (#651).
      SELECT lower(p_flow_slug)
      WHERE v_queue_mode = 'flow'
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

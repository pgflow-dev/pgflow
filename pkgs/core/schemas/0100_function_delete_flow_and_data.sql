-- Deletes a flow and all its associated data
-- WARNING: This is destructive - deletes flow definition AND all runtime data
-- Used by ensure_flow_compiled for development mode recompilation
--
-- The flow's queues are dropped through their persisted definition routes
-- (steps.queue_name), plus the default queue for an empty flow (#650). Queues
-- created by older releases keep their original listed spelling; the drop
-- resolves fresh through pgmq.list_queues() (_listed_queue_name, bypassing
-- the session memo) and an ambiguous match is rejected before any
-- destructive work. Everything runs in one transaction: a failed PGMQ
-- operation rolls the whole deletion back.
create or replace function pgflow.delete_flow_and_data(p_flow_slug text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
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

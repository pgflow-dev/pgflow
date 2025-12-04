-- Deletes a flow and all its associated data
-- WARNING: This is destructive - deletes flow definition AND all runtime data
-- Used by ensure_flow_compiled for development mode recompilation
create or replace function pgflow.delete_flow_and_data(p_flow_slug text)
returns void
language plpgsql
volatile
set search_path to ''
as $$
BEGIN
  -- Drop queue and archive table (pgmq)
  PERFORM pgmq.drop_queue(p_flow_slug);

  -- Delete all associated data in the correct order (respecting FK constraints)
  DELETE FROM pgflow.step_tasks AS task WHERE task.flow_slug = p_flow_slug;
  DELETE FROM pgflow.step_states AS state WHERE state.flow_slug = p_flow_slug;
  DELETE FROM pgflow.runs AS run WHERE run.flow_slug = p_flow_slug;
  DELETE FROM pgflow.deps AS dep WHERE dep.flow_slug = p_flow_slug;
  DELETE FROM pgflow.steps AS step WHERE step.flow_slug = p_flow_slug;
  DELETE FROM pgflow.flows AS flow WHERE flow.flow_slug = p_flow_slug;
END;
$$;

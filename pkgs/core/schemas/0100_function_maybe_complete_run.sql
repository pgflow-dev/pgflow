create or replace function pgflow.maybe_complete_run(run_id uuid)
returns void
language plpgsql
volatile
set search_path to ''
as $$
declare
  v_completed_run pgflow.runs%ROWTYPE;
begin
  -- ==========================================
  -- CHECK AND COMPLETE RUN IF FINISHED
  -- ==========================================
  -- ---------- Complete run if all steps done ----------
  UPDATE pgflow.runs
  SET
    status = 'completed',
    completed_at = now(),
    -- Gather outputs from leaf steps (already stored in step_states.output by writers)
    output = (
      -- Leaf steps = steps with no dependents
      SELECT jsonb_object_agg(
        leaf_state.step_slug,
        leaf_state.output  -- Already aggregated by writers
      )
      FROM pgflow.step_states leaf_state
      WHERE leaf_state.run_id = maybe_complete_run.run_id
        AND leaf_state.status = 'completed'
        AND NOT EXISTS (
          SELECT 1
          FROM pgflow.deps dep
          WHERE dep.flow_slug = leaf_state.flow_slug
            AND dep.dep_slug = leaf_state.step_slug
        )
    )
  WHERE pgflow.runs.run_id = maybe_complete_run.run_id
    AND pgflow.runs.remaining_steps = 0
    AND pgflow.runs.status != 'completed'
  RETURNING * INTO v_completed_run;

  -- ==========================================
  -- BROADCAST COMPLETION EVENT
  -- ==========================================
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

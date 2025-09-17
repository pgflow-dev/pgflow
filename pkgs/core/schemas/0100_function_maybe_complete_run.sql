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
    -- Only compute expensive aggregation when actually completing the run
    output = (
      -- ---------- Gather outputs from leaf steps ----------
      -- Leaf steps = steps with no dependents
      -- For map steps: aggregate all task outputs into array
      -- For single steps: use the single task output
      SELECT jsonb_object_agg(
        step_slug,
        CASE
          WHEN step_type = 'map' THEN aggregated_output
          ELSE single_output
        END
      )
      FROM (
        SELECT DISTINCT
          leaf_state.step_slug,
          leaf_step.step_type,
          -- For map steps: aggregate all task outputs
          CASE WHEN leaf_step.step_type = 'map' THEN
            (SELECT COALESCE(jsonb_agg(leaf_task.output ORDER BY leaf_task.task_index), '[]'::jsonb)
             FROM pgflow.step_tasks leaf_task
             WHERE leaf_task.run_id = leaf_state.run_id
               AND leaf_task.step_slug = leaf_state.step_slug
               AND leaf_task.status = 'completed')
          END as aggregated_output,
          -- For single steps: get the single output
          CASE WHEN leaf_step.step_type = 'single' THEN
            (SELECT leaf_task.output
             FROM pgflow.step_tasks leaf_task
             WHERE leaf_task.run_id = leaf_state.run_id
               AND leaf_task.step_slug = leaf_state.step_slug
               AND leaf_task.status = 'completed'
             LIMIT 1)
          END as single_output
        FROM pgflow.step_states leaf_state
        JOIN pgflow.steps leaf_step ON leaf_step.flow_slug = leaf_state.flow_slug AND leaf_step.step_slug = leaf_state.step_slug
        WHERE leaf_state.run_id = maybe_complete_run.run_id
          AND leaf_state.status = 'completed'
          AND NOT EXISTS (
            SELECT 1
            FROM pgflow.deps dep
            WHERE dep.flow_slug = leaf_state.flow_slug
              AND dep.dep_slug = leaf_state.step_slug
          )
      ) leaf_outputs
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

create or replace function pgflow.maybe_complete_run(run_id uuid)
returns void
language plpgsql
volatile
set search_path to ''
as $$
declare
  v_completed_run pgflow.runs%ROWTYPE;
begin
  -- Update run status to completed and set output when there are no remaining steps
  WITH run_output AS (
    -- Get outputs from final steps (steps that are not dependencies for other steps)
    SELECT jsonb_object_agg(st.step_slug, st.output) as final_output
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
  UPDATE pgflow.runs
  SET
    status = 'completed',
    completed_at = now(),
    output = (SELECT final_output FROM run_output)
  WHERE pgflow.runs.run_id = maybe_complete_run.run_id
    AND pgflow.runs.remaining_steps = 0
    AND pgflow.runs.status != 'completed'
  RETURNING * INTO v_completed_run;

  -- Only send broadcast if run was completed
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
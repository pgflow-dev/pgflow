create or replace function pgflow.maybe_complete_run(run_id uuid)
returns void
language sql
volatile
set search_path to ''
as $$
  -- Update run status to completed and set output when there are no remaining steps
  -- All done in a single declarative SQL statement
  UPDATE pgflow.runs
  SET
    status = 'completed',
    output = (
      -- Get outputs from final steps (steps that are not dependencies for other steps)
      SELECT jsonb_object_agg(st.step_slug, st.output)
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
  WHERE pgflow.runs.run_id = maybe_complete_run.run_id
    AND pgflow.runs.remaining_steps = 0
    AND pgflow.runs.status != 'completed';
$$;

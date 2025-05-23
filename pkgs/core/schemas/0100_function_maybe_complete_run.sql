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
    completed_at = now(),
    output = (
      -- Get outputs from final steps (steps that are not dependencies for other steps)
      SELECT jsonb_object_agg(ss.step_slug, 
        CASE 
          WHEN s.step_type = 'fanout' THEN ss.output  -- For fanout, use aggregated output from step_states
          ELSE st.output  -- For single, use task output
        END
      )
      FROM pgflow.step_states ss
      JOIN pgflow.steps s ON s.flow_slug = ss.flow_slug AND s.step_slug = ss.step_slug
      LEFT JOIN pgflow.step_tasks st ON st.run_id = ss.run_id AND st.step_slug = ss.step_slug AND st.task_index = 0
      WHERE ss.run_id = maybe_complete_run.run_id
        AND ss.status = 'completed'
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

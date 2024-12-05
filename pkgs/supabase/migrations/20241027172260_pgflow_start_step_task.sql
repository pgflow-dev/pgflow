SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.start_step_task(
    run_id UUID,
    step_slug TEXT
)
RETURNS VOID AS $$
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
    v_run pgflow.runs%ROWTYPE;
    v_flow_slug TEXT;
    v_task pgflow.step_tasks%ROWTYPE;
BEGIN
    PERFORM pgflow_locks.wait_for_start_step_to_commit(p_run_id, p_step_slug);

    v_run := pgflow.find_run(p_run_id);
    v_flow_slug := v_run.flow_slug;
    v_task := pgflow.find_step_task(p_run_id, p_step_slug);

    UPDATE pgflow.step_tasks AS st
    SET status = 'started', last_attempt_at = now(), next_attempt_at = NULL
    WHERE st.run_id = v_task.run_id
    AND st.step_slug = v_task.step_slug;
END;
$$ LANGUAGE plpgsql VOLATILE;

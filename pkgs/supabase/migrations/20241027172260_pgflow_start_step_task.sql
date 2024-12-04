SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.start_step_task(
    run_id UUID,
    step_slug TEXT
)
RETURNS VOID AS $$
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
    v_flow_slug TEXT;
    v_task pgflow.step_tasks%ROWTYPE;
BEGIN
    PERFORM pgflow_locks.wait_for_start_step_to_commit(p_run_id, p_step_slug);

    SELECT flow_slug INTO v_flow_slug
    FROM pgflow.step_states ss
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'step_state not found for run_id=% and step_slug=%', p_run_id, p_step_slug;
    ELSE
        RAISE NOTICE 'Found step_state with flow_slug=%', v_flow_slug;
    END IF;

    SELECT st.* INTO v_task
    FROM pgflow.step_tasks AS st
    WHERE st.run_id = p_run_id
    AND st.step_slug = p_step_slug;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'step_task not found for run_id=% and step_slug=%', p_run_id, p_step_slug;
        RETURN;
    END IF;

    UPDATE pgflow.step_tasks AS st
    SET status = 'started', last_attempt_at = now(), next_attempt_at = NULL
    WHERE st.run_id = v_task.run_id
    AND st.step_slug = v_task.step_slug;
END;
$$ LANGUAGE plpgsql VOLATILE;

----------- find_run --------------------------
CREATE OR REPLACE FUNCTION pgflow.find_run(
    run_id uuid
)
RETURNS pgflow.runs
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
DECLARE
    p_run_id uuid := run_id;
    v_run runs%ROWTYPE;
BEGIN
    SELECT r.* INTO v_run
    FROM runs AS r
    WHERE r.run_id = p_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Run not found: run_id=%', p_run_id;
    END IF;

    RETURN v_run;
END;
$$;

----------- find_step_task --------------------------
CREATE OR REPLACE FUNCTION pgflow.find_step_task(
    run_id uuid, step_slug text
)
RETURNS pgflow.step_tasks
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
DECLARE
    p_run_id uuid := run_id;
    p_step_slug text := step_slug;
    v_step_task step_tasks%ROWTYPE;
BEGIN
    SELECT st.* INTO v_step_task
    FROM step_tasks AS st
    WHERE st.run_id = p_run_id
    AND st.step_slug = p_step_slug;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Step task not found for run_id=% and step_slug=%', p_run_id, p_step_slug;
    END IF;

    RETURN v_step_task;
END;
$$;

----------- find_step_state --------------------------
CREATE OR REPLACE FUNCTION pgflow.find_step_state(
    p_run_id uuid,
    p_step_slug text
)
RETURNS pgflow.step_states
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
DECLARE
    v_step_state pgflow.step_states;
BEGIN
    SELECT ss.* INTO v_step_state
    FROM step_states ss
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Step state not found for run_id: % and step_slug: %', p_run_id, p_step_slug;
    END IF;

    RETURN v_step_state;
END;
$$;

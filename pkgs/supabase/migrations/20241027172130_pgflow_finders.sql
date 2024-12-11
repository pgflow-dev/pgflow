----------- find_run --------------------------
DROP FUNCTION IF EXISTS pgflow.find_run(uuid);
CREATE OR REPLACE FUNCTION pgflow.find_run(run_id uuid)
RETURNS pgflow.runs AS $$
DECLARE
    p_run_id uuid := run_id;
    v_run pgflow.runs%ROWTYPE;
BEGIN
    SELECT r.* INTO v_run
    FROM pgflow.runs AS r
    WHERE r.run_id = p_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Run not found: run_id=%', p_run_id;
    END IF;

    RETURN v_run;
END;
$$ LANGUAGE plpgsql VOLATILE;

----------- find_step_task --------------------------
CREATE OR REPLACE FUNCTION pgflow.find_step_task(run_id uuid, step_slug text)
RETURNS pgflow.step_tasks AS $$
DECLARE
    p_run_id uuid := run_id;
    p_step_slug text := step_slug;
    v_step_task pgflow.step_tasks%ROWTYPE;
BEGIN
    SELECT st.* INTO v_step_task
    FROM pgflow.step_tasks AS st
    WHERE st.run_id = p_run_id
    AND st.step_slug = p_step_slug;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Step task not found for run_id=% and step_slug=%', p_run_id, p_step_slug;
    END IF;

    RETURN v_step_task;
END;
$$ LANGUAGE plpgsql VOLATILE;

----------- find_step_state --------------------------
CREATE OR REPLACE FUNCTION pgflow.find_step_state(
    p_run_id uuid,
    p_step_slug text
)
RETURNS pgflow.step_states AS $$
DECLARE
    v_step_state pgflow.step_states;
BEGIN
    SELECT ss.* INTO v_step_state
    FROM pgflow.step_states ss
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Step state not found for run_id: % and step_slug: %', p_run_id, p_step_slug;
    END IF;

    RETURN v_step_state;
END;
$$ LANGUAGE plpgsql VOLATILE;

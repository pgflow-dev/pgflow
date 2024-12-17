CREATE OR REPLACE FUNCTION pgflow.complete_step(
    p_run_id UUID,
    p_step_slug TEXT,
    p_step_result JSONB
)
RETURNS TABLE (
    flow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    status TEXT,
    step_result JSONB
)
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
#variable_conflict use_column
DECLARE
    ready_step RECORD;
    step_state_to_complete step_states%ROWTYPE;
BEGIN
    PERFORM pgflow_locks.wait_for_start_step_to_commit(p_run_id, p_step_slug);

    -- required to make sure we check if dependant steps are ready in serial,
    -- so one of the dependencies can observe all deps for dependant
    -- being ready, so it can start the dependant
    PERFORM pgflow_locks.complete_steps_in_serial(p_run_id);

    step_state_to_complete := find_step_state(p_run_id, p_step_slug);

    PERFORM verify_status(step_state_to_complete, 'pending');

    UPDATE step_states ss
    SET completed_at = now(),
        step_result = p_step_result
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;

    -- This check is actually redundant since we already verified the row exists,
    -- but keeping it as an extra safety measure
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to update step state for run_id: % and step_slug: %', p_run_id, p_step_slug;
    END IF;

    -- Step 4: start all the ready dependants
    FOR ready_step IN
        SELECT * FROM get_ready_dependents(p_run_id, p_step_slug)
    LOOP
        PERFORM start_step(p_run_id, ready_step.dependent_slug);
    END LOOP;

    -- Return the updated step state
    RETURN QUERY
    SELECT
        ss.flow_slug,
        ss.run_id,
        ss.step_slug,
        ss.status,
        ss.step_result
    FROM step_states AS ss
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;
END;
$$;

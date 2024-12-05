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
) AS $$
#variable_conflict use_column
DECLARE
    ready_step RECORD;
    step_state_to_complete pgflow.step_states%ROWTYPE;
BEGIN
    PERFORM pgflow_locks.wait_for_start_step_to_commit(p_run_id, p_step_slug);

    -- required to make sure we check if dependant steps are ready in serial,
    -- so one of the dependencies can observe all deps for dependant
    -- being ready, so it can start the dependant
    PERFORM pgflow_locks.complete_steps_in_serial(p_run_id);

    step_state_to_complete := pgflow.find_step_state(p_run_id, p_step_slug);

    UPDATE pgflow.step_states ss
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
        SELECT ds.to_step_slug AS step_slug
        FROM (
            SELECT DISTINCT d.to_step_slug
            FROM pgflow.deps AS d
            JOIN pgflow.runs AS r ON r.run_id = p_run_id
            WHERE d.flow_slug = r.flow_slug
            AND d.from_step_slug = p_step_slug
        ) ds
        WHERE NOT EXISTS (
            SELECT 1
            FROM pgflow.deps d2
            LEFT JOIN pgflow.step_states ss2
            ON ss2.run_id = p_run_id
            AND ss2.step_slug = d2.from_step_slug
            WHERE d2.to_step_slug = ds.to_step_slug
            AND d2.flow_slug = (SELECT r2.flow_slug FROM pgflow.runs AS r2 WHERE r2.run_id = p_run_id)
            AND (ss2.status IS NULL OR ss2.status NOT IN('completed', 'failed'))
        )
    LOOP
        PERFORM pgflow.start_step(p_run_id, ready_step.step_slug);
    END LOOP;

    -- Return the updated step state
    RETURN QUERY
    SELECT
        ss.flow_slug,
        ss.run_id,
        ss.step_slug,
        ss.status,
        ss.step_result
    FROM pgflow.step_states AS ss
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;
END;
$$ LANGUAGE plpgsql VOLATILE;

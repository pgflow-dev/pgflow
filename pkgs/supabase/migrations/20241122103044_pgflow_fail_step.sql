CREATE OR REPLACE FUNCTION pgflow.fail_step(
    run_id UUID,
    step_slug TEXT,
    error TEXT
)
RETURNS TABLE (
    flow_slug TEXT,
    returned_run_id UUID,
    returned_step_slug TEXT,
    status TEXT,
    step_result JSONB
) AS $$
#variable_conflict use_column
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
    v_step_state pgflow.step_states%ROWTYPE;
BEGIN
    v_step_state := pgflow.find_step_state(p_run_id, p_step_slug);
    PERFORM pgflow.verify_status(v_step_state, 'pending');

    UPDATE pgflow.step_states AS ss
    SET failed_at = now(),
        step_result = jsonb_build_object(
            'error', error
        )
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;

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

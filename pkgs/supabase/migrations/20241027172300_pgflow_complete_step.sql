SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.complete_step(
    p_run_id UUID,
    p_step_slug TEXT,
    p_step_result JSONB
)
RETURNS TABLE (
    workflow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    status TEXT,
    step_result JSONB
) AS $$
DECLARE
    locked_step pgflow.step_states%ROWTYPE;
BEGIN
    -- Ensure whole operation is atomic
    IF NOT (SELECT txid_current() > 0) THEN
        RAISE EXCEPTION 'pgflow.complete_step() must be called within a transaction';
    END IF;

    SELECT
        ss.workflow_slug,
        ss.run_id,
        ss.step_slug,
        ss.status,
        ss.step_result
    INTO locked_step
    FROM pgflow.step_states AS ss
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug
    FOR UPDATE SKIP LOCKED;

    UPDATE pgflow.step_states AS ss
    SET status = 'completed',
        step_result = p_step_result
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;

    PERFORM pgflow.start_step(p_run_id, ready_step.step_slug)
    FROM pgflow.get_ready_dependants_of(p_run_id, p_step_slug) AS ready_step;

    RETURN QUERY
    SELECT
        ss.workflow_slug,
        ss.run_id,
        ss.step_slug,
        ss.status,
        ss.step_result
    FROM pgflow.step_states AS ss
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;
END;
$$ LANGUAGE plpgsql VOLATILE;

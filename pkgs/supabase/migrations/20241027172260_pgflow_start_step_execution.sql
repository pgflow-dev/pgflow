SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.start_step_execution(
    run_id UUID,
    step_slug TEXT
)
RETURNS VOID AS $$
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
    v_flow_slug TEXT;
BEGIN
    PERFORM pgflow.lock_step_state(p_run_id, p_step_slug);

    SELECT flow_slug INTO v_flow_slug
    FROM pgflow.step_states ss
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'step_state not found for run_id=% and step_slug=%', p_run_id, p_step_slug;
    ELSE
        RAISE NOTICE 'Found step_state with flow_slug=%', v_flow_slug;
    END IF;

    INSERT INTO pgflow.step_executions (flow_slug, step_slug, run_id)
    VALUES (v_flow_slug, p_step_slug, p_run_id)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql VOLATILE;

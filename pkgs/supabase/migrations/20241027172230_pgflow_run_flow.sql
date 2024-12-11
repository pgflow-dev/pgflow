SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.run_flow(
    p_flow_slug TEXT,
    p_payload JSONB
)
RETURNS TABLE (
    flow_slug TEXT,
    run_id UUID,
    status TEXT,
    payload JSONB
) AS $$
#variable_conflict use_column
DECLARE
    new_run RECORD;
    v_root_steps TEXT[];
    v_step_slug TEXT;
BEGIN
    -- Insert a new run
    INSERT INTO pgflow.runs (flow_slug, run_id, payload)
    VALUES (p_flow_slug, gen_random_uuid(), p_payload)
    RETURNING *
    INTO new_run;

    -- get root steps
    SELECT array_agg(step_slug) INTO v_root_steps
    FROM pgflow.get_root_steps(p_flow_slug);

    -- check if any root steps exist
    IF v_root_steps IS NULL THEN
        RAISE EXCEPTION 'Flow % has no root steps defined', p_flow_slug;
    END IF;

    -- start all root steps
    FOREACH v_step_slug IN ARRAY v_root_steps LOOP
        PERFORM pgflow.start_step(new_run.run_id, v_step_slug);
    END LOOP;

    -- Return the new run
    RETURN QUERY SELECT
        new_run.flow_slug,
        new_run.run_id,
        new_run.status,
        new_run.payload;
END;
$$ LANGUAGE plpgsql;

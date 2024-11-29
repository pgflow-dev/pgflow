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
BEGIN
    -- Insert a new run
    INSERT INTO pgflow.runs (flow_slug, run_id, payload)
    VALUES (p_flow_slug, gen_random_uuid(), p_payload)
    RETURNING *
    INTO new_run;

    -- start all root steps
    PERFORM pgflow.start_step(new_run.run_id, root_steps.step_slug)
    FROM (select * from pgflow.get_root_steps(p_flow_slug)) as root_steps;

    -- Return the new run
    RETURN QUERY SELECT
        new_run.flow_slug,
        new_run.run_id,
        new_run.status,
        new_run.payload;
END;
$$ LANGUAGE plpgsql;

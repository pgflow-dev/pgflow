SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.run_workflow(
    p_workflow_slug TEXT,
    p_payload JSONB
)
RETURNS TABLE (
    workflow_slug TEXT,
    id UUID,
    status TEXT,
    payload JSONB
) AS $$
DECLARE
    new_run RECORD;
BEGIN
    -- Insert a new run
    INSERT INTO pgflow.runs (workflow_slug, id, payload)
    VALUES (p_workflow_slug, gen_random_uuid(), p_payload)
    RETURNING *
    INTO new_run;

    -- start all root steps
    PERFORM pgflow.start_step(new_run.id, root_steps.slug)
    FROM (select * from pgflow.get_root_steps(p_workflow_slug)) as root_steps;

    -- Return the new run
    RETURN QUERY SELECT
        new_run.workflow_slug,
        new_run.id,
        new_run.status,
        new_run.payload;
END;
$$ LANGUAGE plpgsql;

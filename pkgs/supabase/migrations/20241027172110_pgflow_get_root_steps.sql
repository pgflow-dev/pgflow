CREATE OR REPLACE FUNCTION pgflow.get_root_steps(
    p_flow_slug text
)
RETURNS TABLE (
    flow_slug text,
    step_slug text
)
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS
$$
BEGIN
    RETURN QUERY
    SELECT s.flow_slug, s.step_slug
    FROM steps AS s
    LEFT JOIN deps AS d
        ON s.flow_slug = d.flow_slug AND s.step_slug = d.to_step_slug
    WHERE s.flow_slug = p_flow_slug AND d.from_step_slug IS NULL;
END;
$$;

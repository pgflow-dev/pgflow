-------- get_root_steps ----------------------
----------------------------------------------


CREATE OR REPLACE FUNCTION pgflow.get_root_steps(p_flow_slug text)
RETURNS TABLE (flow_slug text, step_slug text) AS
$$
BEGIN
    RETURN QUERY
    SELECT s.flow_slug, s.step_slug
    FROM pgflow.steps AS s
    LEFT JOIN pgflow.deps AS d
        ON s.flow_slug = d.flow_slug AND s.step_slug = d.to_step_slug
    WHERE s.flow_slug = p_flow_slug AND d.from_step_slug IS NULL;
END;
$$ LANGUAGE plpgsql VOLATILE;

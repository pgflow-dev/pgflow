-- Function to get dependant steps that are ready to run
CREATE OR REPLACE FUNCTION get_ready_dependants_of(
    p_run_id UUID,
    p_step_slug TEXT
)
RETURNS TABLE (step_slug TEXT) AS $$
BEGIN
    RETURN QUERY
    WITH direct_dependants AS (
        -- Get all steps that depend on our current step from workflow
        SELECT DISTINCT d.dependant_slug
        FROM pgflow.deps d
        JOIN pgflow.runs r ON r.id = p_run_id
        WHERE d.workflow_slug = r.workflow_slug
          AND d.dependency_slug = p_step_slug
    )
    SELECT dd.dependant_slug
    FROM direct_dependants dd
    WHERE NOT EXISTS (
        -- Check if there are any incomplete dependencies
        SELECT 1
        FROM pgflow.deps d2
        LEFT JOIN pgflow.step_states ss2
            ON ss2.run_id = p_run_id
            AND ss2.step_slug = d2.dependency_slug
        WHERE d2.dependant_slug = dd.dependant_slug
        AND (ss2.status IS NULL OR ss2.status != 'completed')
    );
END;
$$ LANGUAGE plpgsql STABLE;

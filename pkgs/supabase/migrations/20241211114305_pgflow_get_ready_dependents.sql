CREATE OR REPLACE FUNCTION pgflow.get_ready_dependents(
    p_run_id uuid,
    p_step_slug text
)
RETURNS TABLE (
    dependent_slug text
)
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
BEGIN
    RETURN QUERY
    WITH
    -- get flow_slug for this run
    run_flow AS (
        SELECT r.flow_slug
        FROM runs AS r
        WHERE r.run_id = p_run_id
    ),
    -- find all dependents of the completed step
    dependents AS (
        SELECT DISTINCT d.to_step_slug
        FROM deps AS d
        JOIN run_flow r ON r.flow_slug = d.flow_slug
        WHERE d.from_step_slug = p_step_slug
    ),
    -- for each dependent, find all its dependencies
    dependencies AS (
        SELECT
            d.to_step_slug as dependent_step,
            d.from_step_slug as required_dependency
        FROM deps d
        JOIN dependents dep ON dep.to_step_slug = d.to_step_slug
        JOIN run_flow r ON r.flow_slug = d.flow_slug
    ),
    -- for each dependency, find its step_state
    dependency_states AS (
        SELECT
            d.dependent_step,
            d.required_dependency,
            ss.status
        FROM dependencies d
        LEFT JOIN step_states ss ON
            ss.run_id = p_run_id AND
            ss.step_slug = d.required_dependency
    ),
    -- check if dependent is ready (all dependencies must have completed step_states)
    ready_dependents AS (
        SELECT dependent_step
        FROM dependency_states
        GROUP BY dependent_step
        HAVING BOOL_AND(status = 'completed')  -- all must be completed
               AND COUNT(*) = COUNT(status)    -- all must have step_states
    )
    SELECT dependent_step as step_slug
    FROM ready_dependents;
END;
$$;

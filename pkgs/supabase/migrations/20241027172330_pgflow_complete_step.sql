CREATE OR REPLACE FUNCTION pgflow.complete_step(
    p_run_id UUID,
    p_step_slug TEXT,
    p_step_result JSONB
)
RETURNS TABLE (
    flow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    status TEXT,
    step_result JSONB
) AS $$
DECLARE
    _to_step_slug TEXT;
    ready_step RECORD;
    to_step_slugs TEXT[];
BEGIN
    -- Step 1: find all dependants of this step and store them in an array
    SELECT ARRAY_AGG(ds.to_step_slug ORDER BY ds.to_step_slug) INTO to_step_slugs
    FROM (
        SELECT DISTINCT d.to_step_slug
        FROM pgflow.deps AS d
        JOIN pgflow.runs AS r ON r.run_id = p_run_id
        WHERE d.flow_slug = r.flow_slug
        AND d.from_step_slug = p_step_slug
    ) ds;

    -- Step 2: acquire locks on all dependants in a consistent order to prevent deadlocks
    IF to_step_slugs IS NOT NULL THEN
        FOREACH _to_step_slug IN ARRAY to_step_slugs
        LOOP
            PERFORM pg_advisory_xact_lock(
                hashtext(p_run_id::text),
                hashtext(_to_step_slug)
            );
        END LOOP;
    END IF;

    -- Step 3: update current step state to 'completed',
    --         so it can be considered as completed when
    --         checking dependencies of dependants
    UPDATE pgflow.step_states AS ss
    SET status = 'completed',
        step_result = p_step_result
    WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug;

    -- Step 4: start all the ready dependants
    FOR ready_step IN
        SELECT ds.to_step_slug AS step_slug
        FROM (
            SELECT DISTINCT d.to_step_slug
            FROM pgflow.deps AS d
            JOIN pgflow.runs AS r ON r.run_id = p_run_id
            WHERE d.flow_slug = r.flow_slug
            AND d.from_step_slug = p_step_slug
        ) ds
        WHERE NOT EXISTS (
            SELECT 1
            FROM pgflow.deps d2
            LEFT JOIN pgflow.step_states ss2
            ON ss2.run_id = p_run_id
            AND ss2.step_slug = d2.from_step_slug
            WHERE d2.to_step_slug = ds.to_step_slug
            AND d2.flow_slug = (SELECT r2.flow_slug FROM pgflow.runs AS r2 WHERE r2.run_id = p_run_id)
            AND (ss2.status IS NULL OR ss2.status != 'completed')
        )
    LOOP
        PERFORM pgflow.start_step(p_run_id, ready_step.step_slug);
    END LOOP;

    -- Return the updated step state
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

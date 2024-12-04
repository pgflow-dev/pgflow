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
$$ LANGUAGE plpgsql STABLE;

-------- is_root_step ------------------------
----------------------------------------------
CREATE OR REPLACE FUNCTION pgflow.is_root_step(p_step_slug text)
RETURNS boolean AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM pgflow.deps d
        WHERE d.to_step_slug = p_step_slug
    );
END;
$$ LANGUAGE plpgsql STABLE;

-------- has_unmet_deps ----------------------
----------------------------------------------
CREATE OR REPLACE FUNCTION pgflow.has_unmet_deps(
    p_run_id uuid, p_step_slug text
)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM pgflow.deps d
        JOIN pgflow.step_states ss ON ss.step_slug = d.from_step_slug
            AND ss.run_id = p_run_id
        WHERE d.to_step_slug = p_step_slug
            AND ss.status != 'completed'
    );
END;
$$ LANGUAGE plpgsql STABLE;

----------- FINDERS --------------------------
-- DROP FUNCTION IF EXISTS pgflow.find_run(uuid);
-- CREATE OR REPLACE FUNCTION pgflow.find_run(run_id uuid)
-- RETURNS pgflow.runs AS $$
-- DECLARE
--     p_run_id uuid := run_id;
--     v_run pgflow.runs%ROWTYPE;
-- BEGIN
--     SELECT r.* INTO v_run
--     FROM pgflow.runs AS r
--     WHERE r.run_id = p_run_id;
--
--     IF NOT FOUND THEN
--         RAISE EXCEPTION 'Run not found: run_id=%', p_run_id;
--     END IF;
--
--     RETURN v_run;
-- END;
-- $$ LANGUAGE plpgsql STABLE;

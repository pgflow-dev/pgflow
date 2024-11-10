-------- get_root_steps ----------------------
----------------------------------------------

create or replace function pgflow.get_root_steps(p_flow_slug text)
returns table (flow_slug text, step_slug text) as
$$
BEGIN

RETURN QUERY
SELECT s.flow_slug, s.step_slug
FROM pgflow.steps AS s
LEFT JOIN pgflow.deps AS d ON s.step_slug = d.to_step_slug
WHERE s.flow_slug = p_flow_slug AND d.to_step_slug IS NULL;

END;
$$ language plpgsql stable;


-------- is_root_step ------------------------
----------------------------------------------
create or replace function pgflow.is_root_step(p_step_slug text)
returns boolean as $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM pgflow.deps d
        WHERE d.to_step_slug = p_step_slug
    );
END;
$$ language plpgsql stable;

-------- has_unmet_deps ----------------------
----------------------------------------------
create or replace function pgflow.has_unmet_deps(
    p_run_id uuid, p_step_slug text
)
returns boolean as $$
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
$$ language plpgsql stable;

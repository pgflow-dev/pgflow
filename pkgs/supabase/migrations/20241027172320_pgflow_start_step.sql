SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.start_step(
    p_run_id UUID,
    p_step_slug TEXT
)
RETURNS TABLE (
    flow_slug TEXT,
    run_id UUID,
    status TEXT,
    step_result JSONB
) AS $$
#variable_conflict use_column
DECLARE
    locked_run pgflow.runs%ROWTYPE;
    step_state pgflow.step_states%ROWTYPE;
    job_payload JSONB;
BEGIN
    SELECT
    r.flow_slug,
    r.run_id,
    r.status,
    r.payload
    INTO locked_run
    FROM pgflow.runs AS r
    WHERE r.run_id = p_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Run not found: run_id=%', p_run_id;
        RETURN;
    END IF;

    -- IF pgflow.has_unmet_deps(p_run_id, p_step_slug) THEN
    --     RAISE EXCEPTION 'Dependencies not met for step: run_id=%, step_slug=%', p_run_id, p_step_slug;
    -- END IF;
    --
    -- Lock the step_state row to prevent concurrent modifications
    BEGIN
        INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug) VALUES (
            locked_run.flow_slug,
            p_run_id,
            p_step_slug
        )
        RETURNING * INTO step_state;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Step already started for run: run_id=%, step_slug=%', p_run_id, p_step_slug;
        RETURN;
    END;

    -- collect dependencies of a step into json object with keys being slugs
    -- of dependency steps and values being results of that dependency steps
    --
    -- if current step depends on step_a and step_b, and step_a resulted in
    -- json value 23 and step_b resulted in json value "hello", then this code
    -- will store following object as job_payload:
    --
    -- {
    --   "step_a": 23,
    --   "step_b": "hello"
    -- }
    WITH steps_with_results AS (
        SELECT ss.step_result, d.from_step_slug AS step_slug
        FROM pgflow.deps d
        JOIN pgflow.step_states ss ON ss.step_slug = d.from_step_slug
            AND ss.run_id = p_run_id
        WHERE d.to_step_slug = p_step_slug
    ),
    deps_payload AS (
        SELECT jsonb_object_agg(swr.step_slug, swr.step_result) AS deps
        FROM steps_with_results swr
    ),
    run as (
        SELECT
        r.flow_slug,
        r.run_id,
        r.status,
        r.payload
        FROM pgflow.runs AS r
        WHERE r.run_id = p_run_id
    )
    SELECT COALESCE(deps, '{}'::jsonb) || jsonb_build_object(
        '__run__', to_jsonb(run.*),
        '__step__', jsonb_build_object('step_slug', p_step_slug)
    )
    INTO job_payload
    FROM deps_payload, run;

    PERFORM pgflow.enqueue_job(
        locked_run.flow_slug,
        p_run_id,
        p_step_slug,
        job_payload
    );

    RETURN QUERY
    SELECT
        step_state.flow_slug,
        step_state.run_id,
        step_state.status,
        step_state.step_result;
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE OR REPLACE FUNCTION pgflow.start_step(
    p_run_id UUID,
    p_step_slug TEXT
)
RETURNS TABLE (
    flow_slug TEXT,
    step_slug TEXT,
    run_id UUID,
    status TEXT,
    step_result JSONB
)
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
DECLARE
    locked_run runs%ROWTYPE;
    step_state step_states%ROWTYPE;
    job_payload JSONB;
BEGIN
    locked_run := find_run(p_run_id);

    BEGIN
        INSERT INTO step_states (flow_slug, run_id, step_slug)
        VALUES (locked_run.flow_slug, p_run_id, p_step_slug)
        RETURNING * INTO step_state;
    EXCEPTION
        WHEN unique_violation THEN
            -- Another transaction already started this step
            SELECT * INTO step_state
            FROM step_states ss
            WHERE ss.run_id = p_run_id AND ss.step_slug = p_step_slug;
        WHEN others THEN
            RAISE EXCEPTION 'Error inserting into step_states: %', SQLERRM;
    END;

    PERFORM verify_status(step_state, 'pending');

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
        FROM deps d
        JOIN step_states ss ON ss.step_slug = d.from_step_slug
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
        FROM runs AS r
        WHERE r.run_id = p_run_id
    )
    SELECT COALESCE(deps, '{}'::jsonb) || jsonb_build_object('run', run.payload)
    INTO job_payload
    FROM deps_payload, run;

    PERFORM enqueue_job(
        locked_run.flow_slug,
        p_run_id,
        p_step_slug,
        job_payload
    );

    RETURN QUERY
    SELECT
        step_state.flow_slug,
        p_step_slug,
        step_state.run_id,
        step_state.status,
        step_state.step_result;
END;
$$;

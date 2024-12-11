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
    locked_run := pgflow.find_run(p_run_id);

    BEGIN
        INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug)
        VALUES (locked_run.flow_slug, p_run_id, p_step_slug)
        RETURNING * INTO step_state;
    EXCEPTION
        WHEN unique_violation THEN
            -- Another transaction already started this step
            SELECT * INTO step_state
            FROM pgflow.step_states ss
            WHERE ss.run_id = p_run_id AND ss.step_slug = p_step_slug;
        WHEN others THEN
            RAISE EXCEPTION 'Error inserting into step_states: %', SQLERRM;
    END;

    PERFORM pgflow.verify_status(step_state, 'pending');

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
    SELECT jsonb_build_object(
        'payload', COALESCE(deps, '{}'::jsonb) || jsonb_build_object('run', run.payload),
        'meta', jsonb_build_object(
            'flow_slug', run.flow_slug,
            'step_slug', p_step_slug,
            'run_id', run.run_id,
            'run_status', run.status
        )
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

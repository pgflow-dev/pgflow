CREATE TABLE IF NOT EXISTS pgflow.step_state_requests (
    flow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    request_id NUMERIC NOT NULL
);
COMMENT ON TABLE pgflow.step_state_requests
IS 'Associates a request with step_state that triggered it';

CREATE OR REPLACE FUNCTION pgflow.enqueue_job_edge_fn(
    flow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    payload JSONB
)
RETURNS VOID AS $$
BEGIN
    WITH secret as (
        select decrypted_secret AS supabase_anon_key
        from vault.decrypted_secrets
    where name = 'supabase_anon_key'
    ),
    settings AS (
        select decrypted_secret AS app_url
        from vault.decrypted_secrets
        where name = 'app_url'
    ),
    request as (
        select net.http_post(
            url := (select app_url from settings) || '/functions/v1/pgflow',
            body := payload::jsonb,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (select supabase_anon_key from secret)
            ),
            timeout_milliseconds := 5000
        ) AS id
    )
    INSERT INTO pgflow.step_state_requests
    SELECT
        flow_slug,
        run_id,
        step_slug,
        request.id
    FROM request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

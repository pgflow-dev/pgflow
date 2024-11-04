CREATE OR REPLACE FUNCTION pgflow.enqueue_job_pgqueuer(
    workflow_slug TEXT,
    step_slug TEXT,
    payload JSONB
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.pgqueuer (priority, entrypoint, payload, status)
    SELECT
        0,
        workflow_slug || '/' || step_slug,
        payload::text::bytea,
        'queued'
    FROM run;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS pgflow.step_state_requests (
    workflow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    request_id NUMERIC NOT NULL
);

CREATE OR REPLACE FUNCTION pgflow.enqueue_job_edge_fn(
    workflow_slug TEXT,
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
            url := (select app_url from settings) || '/functions/v1/execute-step',
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
        workflow_slug,
        run_id,
        step_slug,
        request.id
    FROM request;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pgflow.enqueue_job(
    workflow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    payload JSONB
)
RETURNS VOID AS $$
BEGIN
    PERFORM pgflow.enqueue_job_edge_fn(workflow_slug, run_id, step_slug, payload);
END;
$$ LANGUAGE plpgsql;

-- Associates a response with a request
-- API: Private
-- CREATE UNLOGGED TABLE net._http_response (
--     id BIGINT,
--     status_code INTEGER,
--     content_type TEXT,
--     headers JSONB,
--     content TEXT,
--     timed_out BOOL,
--     error_msg TEXT,
--     created TIMESTAMPTZ NOT NULL DEFAULT now()
-- );

CREATE OR REPLACE FUNCTION pgflow.handle_http_response()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pgflow.complete_step(
        run_id,
        step_slug,
        NEW.content::jsonb
    )
    FROM pgflow.step_state_requests
    WHERE request_id = NEW.id
    AND NEW.status_code >= 200 AND NEW.status_code < 300;

    PERFORM pgflow.fail_step(
        run_id,
        step_slug,
        jsonb_build_object('error', NEW.error_msg)
    )
    FROM pgflow.step_state_requests
    WHERE request_id = NEW.id
    AND NEW.status_code >= 400;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CREATE OR REPLACE TRIGGER handle_http_response_trigger
-- AFTER INSERT ON net._http_response
-- FOR EACH ROW
-- EXECUTE FUNCTION pgflow.handle_http_response();

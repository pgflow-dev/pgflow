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
    WITH request as (
        select net.http_post(
          url := 'http://host.docker.internal:54321/functions/v1/execute-step',
          body := payload::jsonb,
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
    WHERE request_id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_http_response_trigger
AFTER INSERT ON net._http_response
FOR EACH ROW
EXECUTE FUNCTION pgflow.handle_http_response();

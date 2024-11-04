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

CREATE OR REPLACE FUNCTION pgflow.enqueue_job(
    workflow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    payload JSONB
)
RETURNS VOID AS $$
BEGIN
    PERFORM pgflow.enqueue_job_pgqueuer(workflow_slug, run_id, step_slug, payload);
END;
$$ LANGUAGE plpgsql;

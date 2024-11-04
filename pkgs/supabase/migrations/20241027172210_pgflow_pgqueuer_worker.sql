CREATE OR REPLACE FUNCTION pgflow.enqueue_job_pgqueuer(
    workflow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    payload JSONB
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.pgqueuer (priority, entrypoint, payload, status)
    VALUES (
        0,
        workflow_slug || '/' || step_slug,
        payload::text::bytea,
        'queued'
    );
END;
$$ LANGUAGE plpgsql;

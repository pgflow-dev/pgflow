-- TODO: make decision which task queue to use based on the steps
--       definition, so it is possible to have jobs in python and typescript
CREATE OR REPLACE FUNCTION pgflow.enqueue_job(
    flow_slug TEXT,
    run_id UUID,
    step_slug TEXT,
    payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
BEGIN
    PERFORM enqueue_step_task(flow_slug, run_id, step_slug, payload);
END;
$$;

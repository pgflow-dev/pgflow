CREATE OR REPLACE FUNCTION pgflow.retry_step_task(
    run_id uuid,
    step_slug text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
DECLARE
    p_run_id uuid := run_id;
    p_step_slug text := step_slug;
    v_task step_tasks%ROWTYPE;
BEGIN
    v_task := find_step_task(p_run_id, p_step_slug);

    -- We allot to retry queued tasks because of unreliability of the
    -- current queue implementation - sync http request calls edge fn to enqueue
    -- The request may fail due to network issues or edge function can be
    -- killed because of CPU/wall clock limits before acknowledging the start
    --
    -- TODO: this should be removed after migrating to PGMQ edge fn worker
    PERFORM verify_status(v_task, ARRAY['failed', 'queued']);

    PERFORM enqueue_step_task(
        flow_slug := v_task.flow_slug,
        run_id := v_task.run_id,
        step_slug := v_task.step_slug,
        payload := v_task.payload
    );
END;
$$

create or replace function pgflow.enqueue_step_task(
    flow_slug text,
    run_id uuid,
    step_slug text,
    payload jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path to pgflow
as $$
DECLARE
    p_payload jsonb := payload;
    p_run_id uuid := run_id;
    p_step_slug text := step_slug;
    http_response text;
    v_run runs%ROWTYPE;
    v_step_state step_states%ROWTYPE;
BEGIN
    PERFORM pgflow_locks.wait_for_start_step_to_commit(p_run_id, p_step_slug);

    v_run := find_run(p_run_id);

    -- make sure the step is started by searching for its state
    v_step_state := find_step_state(p_run_id, p_step_slug);

    -- verify step is in pending status
    IF v_step_state.status != 'pending' THEN
        RAISE EXCEPTION 'Cannot enqueue task for step in % status', v_step_state.status;
    END IF;

    -- create step_task or increment attempt_count on existing record
    INSERT INTO step_tasks AS st (flow_slug, run_id, step_slug, next_attempt_at, payload)
    VALUES (v_run.flow_slug, p_run_id, p_step_slug, now(), p_payload)
    ON CONFLICT ON CONSTRAINT step_tasks_pkey DO UPDATE
    SET
        status = 'queued',
        attempt_count = st.attempt_count + 1,
        next_attempt_at = now();

    -- TODO: replace with pgmq call or extract some abstraction for other task queues
    PERFORM call_edgefn('pgflow-3', p_payload::text);
END;
$$;

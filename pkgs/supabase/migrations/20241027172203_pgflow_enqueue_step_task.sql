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
    v_step_task step_tasks%ROWTYPE;
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
        next_attempt_at = now()
    RETURNING * INTO v_step_task;

    IF v_step_task.message_id IS NOT NULL THEN
        PERFORM pgmq.archive('pgflow', v_step_task.message_id);
    END IF;

    WITH new_message AS (
        select send as msg_id FROM pgmq.send('pgflow', jsonb_build_object(
            'run_id', v_run.run_id,
            'step_slug', v_step_state.step_slug
            -- TODO: implement some kind of task_key to allow for multiple tasks per step
        ))
    )
    UPDATE step_tasks AS st
    SET message_id = new_message.msg_id
    FROM new_message
    WHERE st.run_id = v_run.run_id
    AND st.step_slug = v_step_state.step_slug;

    PERFORM pg_notify('pgflow', '');

    -- TODO: replace with pgmq call or extract some abstraction for other task queues
    -- PERFORM call_edgefn('pgflow-3', p_payload::text);
END;
$$;

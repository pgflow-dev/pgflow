create or replace function pgflow.enqueue_step_task(
    flow_slug text,
    run_id uuid,
    step_slug text,
    payload jsonb
)
returns void as $$
DECLARE
    p_payload jsonb := payload;
    p_run_id uuid := run_id;
    p_step_slug text := step_slug;
    http_response text;
    v_task pgflow.step_tasks%ROWTYPE;
    v_run pgflow.runs%ROWTYPE;
BEGIN
    PERFORM pgflow_locks.wait_for_start_step_to_commit(p_run_id, p_step_slug);

    v_run := pgflow.find_run(p_run_id);

    -- create step_task or increment attempt_count on existing record
    INSERT INTO pgflow.step_tasks AS st (flow_slug, run_id, step_slug, payload)
    VALUES (v_run.flow_slug, p_run_id, p_step_slug, p_payload)
    ON CONFLICT ON CONSTRAINT step_tasks_pkey DO UPDATE
    SET
        status = 'queued',
        attempt_count = st.attempt_count + 1,
        next_attempt_at = now()
    RETURNING st.* INTO v_task;

    WITH secret as (
        select decrypted_secret AS supabase_anon_key
        from vault.decrypted_secrets
        where name = 'supabase_anon_key'
    ),
    settings AS (
        select decrypted_secret AS app_url
        from vault.decrypted_secrets
        where name = 'app_url'
    )
    select content into http_response
    from extensions.http((
        'POST',
        (select app_url from settings) || '/functions/v1/pgflow-3',
        ARRAY[
            http_header(
                'Authorization',
                'Bearer ' || (select supabase_anon_key from secret)
            )
        ],
        'application/json',
        p_payload::text
    )::http_request)
    where status >= 200 and status < 300;

    if http_response IS NULL then
        raise exception 'Edge function returned non-OK status';
    end if;
END;
$$ language plpgsql security definer;

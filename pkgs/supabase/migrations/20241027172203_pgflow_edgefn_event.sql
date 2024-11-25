create or replace function pgflow.enqueue_job_edge_fn_event(
    flow_slug text,
    run_id uuid,
    step_slug text,
    payload jsonb
)
returns void as $$
DECLARE
    result text;
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
    )
    select content into result
    from extensions.http((
        'POST',
        (select app_url from settings) || '/functions/v1/pgflow-2',
        ARRAY[
            http_header(
                'Authorization', 
                'Bearer ' || (select supabase_anon_key from secret)
            ) 
        ],
        'application/json',
        payload::jsonb::text
    )::http_request)
    where status >= 200 and status < 300;

    if result IS NULL then
        raise exception 'Edge function returned non-OK status';
    end if;
END;
$$ language plpgsql security definer;

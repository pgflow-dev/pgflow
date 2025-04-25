create extension if not exists pg_net;

-- Calls edge function asynchronously, requires Vault secrets to be set:
--   - supabase_anon_key
--   - app_url
create or replace function pgflow.call_edgefn_async(
  function_name text,
  body text
)
returns bigint
language plpgsql
volatile
set search_path to pgflow
as $$
declare
    request_id bigint;
begin
    IF function_name IS NULL OR function_name = '' THEN
        raise exception 'function_name cannot be null or empty';
    END IF;

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
    select net.http_post(
        url => (select app_url from settings) || '/functions/v1/' || function_name,
        body => jsonb_build_object('body', body),
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select supabase_anon_key from secret)
        )
    ) into request_id;

    return request_id;
end;
$$;

-- Spawn a new worker asynchronously via edge function
--
-- It is intended to be used in a cron job that ensures continuos operation
create or replace function pgflow.spawn(
  function_name text
) returns integer as $$
declare
    p_function_name text := function_name;
    v_active_count integer;
begin
    SELECT COUNT(*)
    INTO v_active_count
    FROM pgflow.active_workers AS aw
    WHERE aw.function_name = p_function_name;

    IF v_active_count < 1 THEN
        raise notice 'Spawning new worker: %', p_function_name;
        PERFORM pgflow.call_edgefn_async(p_function_name, '');
        return 1;
    ELSE
        raise notice 'Worker Exists for queue: NOT spawning new worker for queue: %', p_function_name;
        return 0;
    END IF;
end;
$$ language plpgsql;

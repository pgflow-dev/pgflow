create extension if not exists pg_net;

create schema if not exists supaworker;

create or replace function supaworker.call_edgefn_async(
    function_name text,
    body text
)
returns bigint
language plpgsql
volatile
set search_path to supaworker
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


create or replace function pgflow.call_edgefn(
    function_name text,
    body text
)
returns void
language plpgsql
volatile
set search_path to pgflow
as $$
declare
    http_response text;
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
    select content into http_response
    from extensions.http((
        'POST',
        (select app_url from settings) || '/functions/v1/' || function_name,
        ARRAY[
            extensions.http_header(
                'Authorization',
                'Bearer ' || (select supabase_anon_key from secret)
            )
        ],
        'application/json',
        body
    )::extensions.http_request)
    where status >= 200 and status < 300;

    if http_response IS NULL then
        raise exception 'Edge function returned non-OK status';
    end if;
end;
$$;

create schema if not exists utils;
grant usage on schema utils to anon, authenticated, service_role;
grant all on all tables in schema utils to anon, authenticated, service_role;
grant all on all routines in schema utils to anon, authenticated, service_role;
grant all on all sequences in schema utils to anon, authenticated, service_role;
alter default privileges for role postgres in schema utils
grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema utils
grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema utils
grant all on sequences to anon, authenticated, service_role;

-- http
drop extension if exists http;
create extension http with schema extensions;

-- cron
drop extension if exists pg_cron;
create extension pg_cron;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- vector
drop extension if exists vector;
create extension vector with schema extensions;

-- utils.edge_fn()
create or replace function utils.edge_fn(fn_name text, body text)
returns text
language plpgsql
as $$
declare
    result text;
    url text = 'http://host.docker.internal:54321/functions/v1/' || fn_name;
begin
    select content into result
    from extensions.http_post(url, body, 'application/json')
    where status >= 200 and status < 300;

    if result is null then
        raise exception 'Edge function returned non-OK status';
    end if;

    return result;
end;
$$;

-- utils.embed()
create or replace function utils.embed(input text)
returns vector(1536) as $$
begin
return utils.edge_fn('embed', json_build_object('input', input)::text)::vector(1536);
end;
$$ language plpgsql;


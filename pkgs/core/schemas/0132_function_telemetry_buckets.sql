-- Shared bucket scales. The ingest Worker validates the exact same strings.

create or replace function pgflow_telemetry.bucket_count(p_count bigint)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_count <= 0 then '0'
    when p_count = 1 then '1'
    when p_count <= 3 then '2-3'
    when p_count <= 7 then '4-7'
    when p_count <= 15 then '8-15'
    when p_count <= 31 then '16-31'
    when p_count <= 63 then '32-63'
    when p_count <= 127 then '64-127'
    when p_count <= 255 then '128-255'
    else '256+'
  end
$$;

create or replace function pgflow_telemetry.bucket_steps(p_steps bigint)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_steps <= 1 then '1'
    when p_steps <= 3 then '2-3'
    when p_steps <= 7 then '4-7'
    when p_steps <= 15 then '8-15'
    when p_steps <= 31 then '16-31'
    else '32+'
  end
$$;

create or replace function pgflow_telemetry.bucket_duration(p_duration interval)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_duration < '100 milliseconds'::interval then '<100ms'
    when p_duration < '1 second'::interval then '100-999ms'
    when p_duration < '10 seconds'::interval then '1-9.9s'
    when p_duration < '1 minute'::interval then '10-59s'
    when p_duration < '5 minutes'::interval then '1-4.9m'
    when p_duration < '30 minutes'::interval then '5-29m'
    when p_duration < '2 hours'::interval then '30m-1.9h'
    when p_duration < '1 day'::interval then '2-23h'
    when p_duration < '7 days'::interval then '1-6d'
    else '7d+'
  end
$$;

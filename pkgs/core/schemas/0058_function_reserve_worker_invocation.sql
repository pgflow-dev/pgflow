-- Lock candidates in a consistent order, then check readiness in a new statement.
-- A worker can commit readiness while we wait for its registration row. A
-- worker lookup in the locking statement would still use the old snapshot.
create or replace function pgflow.reserve_worker_invocations(function_names text[])
returns table (function_name text, invocation_id uuid)
language plpgsql
as $$
declare
  locked_names text[];
begin
  select array_agg(candidate.function_name) into locked_names
  from (
    select wf.function_name
    from pgflow.worker_functions as wf
    where wf.function_name = any(reserve_worker_invocations.function_names)
      and wf.enabled
      and wf.start_mode = 'http'
      and (
        wf.invocation_status is distinct from 'pending'
        or wf.invocation_expires_at is null
        or wf.invocation_expires_at <= clock_timestamp()
      )
      and (
        wf.last_invoked_at is null
        or wf.last_invoked_at <= clock_timestamp() - wf.debounce
      )
    order by wf.function_name
    for update of wf
  ) as candidate;

  return query
  update pgflow.worker_functions as wf
  set invocation_id = gen_random_uuid(),
      invocation_expires_at = clock_timestamp() + interval '60 seconds',
      invocation_status = 'pending',
      invocation_worker_id = null,
      invocation_error = null,
      last_invoked_at = clock_timestamp()
  where wf.function_name = any(locked_names)
    and not exists (
      select 1 from pgflow.workers as w
      where w.function_name = wf.function_name
        and w.stopped_at is null
        and w.deprecated_at is null
        and w.last_heartbeat_at > clock_timestamp() - wf.debounce
    )
  returning wf.function_name, wf.invocation_id;
end;
$$;

-- Authenticated direct HTTP startup uses the same reservation as cron.
create or replace function pgflow.reserve_worker_invocation(function_name text)
returns uuid
language sql
as $$
  select r.invocation_id
  from pgflow.reserve_worker_invocations(function_names => array[reserve_worker_invocation.function_name]) as r;
$$;

comment on function pgflow.reserve_worker_invocation(text) is
'Reserves one pending HTTP startup for 60 seconds under a per-function row lock.
Shared by cron and manual startup; returns NULL while healthy, pending, disabled, process-started or debounced.';

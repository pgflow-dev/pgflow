-- Shared reservation for cron and authenticated direct HTTP startup.
create or replace function pgflow.reserve_worker_invocation(function_name text)
returns uuid
language sql
as $$
  with
    -- Lock the registration row only when it is eligible: enabled, HTTP-started,
    -- past debounce, with no unexpired pending invocation and no healthy worker.
    -- Concurrent reservations re-check eligibility under the row lock, so at most
    -- one current pending invocation can exist per function.
    eligible as (
      select wf.function_name
      from pgflow.worker_functions as wf
      where wf.function_name = reserve_worker_invocation.function_name
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
        and not exists (
          select 1 from pgflow.workers as w
          where w.function_name = wf.function_name
            and w.stopped_at is null
            and w.deprecated_at is null
            and w.last_heartbeat_at > clock_timestamp() - wf.debounce
        )
      for update
    ),
    reserved as (
      update pgflow.worker_functions as wf
      set invocation_id = gen_random_uuid(),
          invocation_expires_at = clock_timestamp() + interval '60 seconds',
          invocation_status = 'pending',
          invocation_worker_id = null,
          invocation_error = null,
          last_invoked_at = clock_timestamp()
      from eligible as e
      where wf.function_name = e.function_name
      returning wf.invocation_id
    )
  select invocation_id from reserved;
$$;

comment on function pgflow.reserve_worker_invocation(text) is
'Reserves one pending HTTP startup for 60 seconds under a per-function row lock.
Shared by cron and manual startup; returns NULL while healthy, pending, disabled, process-started or debounced.';

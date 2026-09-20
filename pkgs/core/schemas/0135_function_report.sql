-- Daily collector. One pg_net attempt, no retries, no response inspection:
-- telemetry must be invisible to the host database, so every failure path
-- (including query cancellation) returns an 'error: ' status silently, and
-- the queue insert, audit row, and prune roll back together.
--
-- statement_timeout is deliberately NOT set inside this function: PostgreSQL
-- does not arm a statement timer that changes mid-call (verified against
-- 17.6; see telemetry-evidence/correction-1). The cron command scheduled by
-- the telemetry migration and enable() wraps this call with
-- `set local statement_timeout = '5 s'`. Callers running report() manually
-- should set their own statement_timeout first.
create or replace function pgflow_telemetry.report()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_day date := current_date - 1;
  v_payload jsonb;
  v_request_id bigint;
begin
  -- Every failure path, including the gates below, returns a status:
  -- query cancellation (SQLSTATE 57014) or any gate failure must not
  -- escape this function (regression-tested in report.test.sql).
  begin
    if not exists (
      select 1 from pgflow.runs r
      where r.started_at >= v_day and r.started_at < v_day + 1
    ) then
      return 'skipped: inactive day';
    end if;

    if exists (
      select 1 from pgflow_telemetry.sent_reports s where s.day = v_day
    ) then
      return 'skipped: already reported';
    end if;

    -- Local CLI stack (developer machines, CI on supabase start) never sends.
    if pgflow.is_local() then
      return 'skipped: local';
    end if;
  exception
    when query_canceled then
      return 'error: canceled';
    when others then
      return 'error: gate failed';
  end;

  begin
    v_payload := pgflow_telemetry.build_payload(v_day);
    -- build_payload enforces the receiver's limits; this guard keeps a
    -- future regression from queueing a body the receiver would reject.
    if jsonb_array_length(v_payload->'contributions') > 64
      or octet_length(v_payload::text) > 2048 then
      return 'error: build failed';
    end if;
  exception
    when query_canceled then
      return 'error: canceled';
    when others then
      return 'error: build failed';
  end;

  -- pg_net queues transactionally: a failure in the audit insert or the
  -- prune rolls the queued request back with everything else in this block.
  begin
    v_request_id := net.http_post(
      url => 'https://pgflow-telemetry.workers.dev',
      body => v_payload,
      headers => jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds => 5000
    );
    insert into pgflow_telemetry.sent_reports (day, payload, request_id)
    values (v_day, v_payload, v_request_id);

    delete from pgflow_telemetry.sent_reports
    where day < current_date - 90;
  exception
    when query_canceled then
      return 'error: canceled';
    when others then
      return 'error: send failed';
  end;

  return 'sent: ' || v_request_id;
end
$$;

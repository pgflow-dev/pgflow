-- Daily collector. One pg_net attempt, no retries, no response inspection,
-- 5 s statement timeout: telemetry must be invisible to the host database.
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

  perform set_config('statement_timeout', '5000', true);

  begin
    v_payload := pgflow_telemetry.build_payload(v_day);
  exception when others then
    raise warning 'pgflow telemetry: payload build failed, sending nothing';
    return 'error: build failed';
  end;

  begin
    v_request_id := net.http_post(
      url => 'https://pgflow-telemetry.workers.dev',
      body => v_payload::text,
      headers => jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds => 5000
    );
  exception when others then
    raise warning 'pgflow telemetry: http_post queueing failed';
    return 'error: queue failed';
  end;

  insert into pgflow_telemetry.sent_reports (day, payload, request_id)
  values (v_day, v_payload, v_request_id);

  delete from pgflow_telemetry.sent_reports
  where day < current_date - 90;

  return 'sent: ' || v_request_id;
end
$$;

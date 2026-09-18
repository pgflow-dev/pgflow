-- The cron.job row is the enabled switch. enable() is idempotent.
create or replace function pgflow_telemetry.disable()
returns void
language plpgsql
set search_path = ''
as $disable$
begin
  begin
    perform cron.unschedule('pgflow_telemetry_report');
  exception when others then
    null; -- job already absent
  end;
end
$disable$;

create or replace function pgflow_telemetry.enable()
returns void
language plpgsql
set search_path = ''
as $enable$
begin
  perform pgflow_telemetry.disable();
  perform cron.schedule(
    'pgflow_telemetry_report',
    '17 3 * * *',
    $$select pgflow_telemetry.report()$$
  );
end
$enable$;

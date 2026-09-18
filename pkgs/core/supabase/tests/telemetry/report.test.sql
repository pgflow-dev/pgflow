begin;
select plan(6);

select pgflow_tests.reset_db();

-- Gate order: inactive -> already reported -> local. Test env IS local, so
-- only the first two gates and the switch functions are observable here.
select is(
  pgflow_telemetry.report(),
  'skipped: inactive day',
  'fresh database has no yesterday runs, sends nothing'
);

select pgflow_tests.setup_flow('sequential');
select pgflow.start_flow('sequential', '{}'::jsonb);
update pgflow.runs set started_at = current_date - 1 + interval '1 hour';

insert into pgflow_telemetry.sent_reports (day, payload)
values (current_date - 1, '{"schema":1,"contributions":[]}'::jsonb);

select is(
  pgflow_telemetry.report(),
  'skipped: already reported',
  'existing sent_reports row for the day blocks a second report'
);

delete from pgflow_telemetry.sent_reports;

select is(
  pgflow_telemetry.report(),
  'skipped: local',
  'local databases never send'
);

select is(
  (select count(*) from pgflow_telemetry.sent_reports),
  0::bigint,
  'skipped local report writes no audit row'
);

select pgflow_telemetry.disable();
select ok(
  not exists (
    select 1 from cron.job
    where jobname = 'pgflow_telemetry_report'
  ),
  'disable() removes the cron job (the switch)'
);

select pgflow_telemetry.enable();
select ok(
  exists (
    select 1 from cron.job
    where jobname = 'pgflow_telemetry_report'
      and schedule = '17 3 * * *'
  ),
  'enable() restores the daily job'
);

select finish();
rollback;

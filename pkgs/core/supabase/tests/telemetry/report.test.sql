begin;
select plan(25);

select pgflow_tests.reset_db();

select is(
  (
    select command from cron.job where jobname = 'pgflow_telemetry_report'
  ),
  'begin; set local statement_timeout = ''5 s''; select pgflow_telemetry.report(); commit;',
  'migration schedules the timeout-wrapped command exactly once'
);

select is(
  (
    select r.jobid from pgflow_telemetry.job_registry r
    where r.jobname = 'pgflow_telemetry_report'
  ),
  (
    select jobid from cron.job where jobname = 'pgflow_telemetry_report'
  ),
  'migration registers the scheduled job id'
);

-- Gate order: inactive -> already reported -> local. The pgTAP transaction
-- never commits, so the non-local probes below can queue without sending.
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

-- Non-local send path: temporarily override the local gate. Everything runs
-- inside this rollback-only transaction, so pg_net never dispatches.
select set_config('app.settings.jwt_secret', 'not-the-local-secret', true);

select alike(
  pgflow_telemetry.report(),
  'sent: %',
  'non-local report queues through net.http_post and returns the request id'
);

select is(
  (
    select payload from pgflow_telemetry.sent_reports where day = current_date - 1
  ),
  pgflow_telemetry.preview(current_date - 1),
  'sent audit row stores exactly the payload report() queued'
);

select is(
  (
    select count(*) from net.http_request_queue q
    where q.url like 'https://pgflow-telemetry.workers.dev%'
      and convert_from(q.body, 'UTF8')::jsonb = pgflow_telemetry.preview(current_date - 1)
  ),
  1::bigint,
  'pg_net queue holds the jsonb payload for the telemetry endpoint'
);

select is(
  pgflow_telemetry.report(),
  'skipped: already reported',
  'successful send marks the day as reported'
);

-- Injected failure: the audit insert raises after http_post queued.
-- The send block must roll the queue insert back with the audit row.
create function pgflow_telemetry.tests_block_audit() returns trigger
language plpgsql
as $fn$
begin
  raise exception 'injected audit failure';
end
$fn$;

create trigger tests_block_audit
before insert on pgflow_telemetry.sent_reports
for each row execute function pgflow_telemetry.tests_block_audit();

delete from pgflow_telemetry.sent_reports;
delete from net.http_request_queue;

select is(
  pgflow_telemetry.report(),
  'error: send failed',
  'audit failure after queueing fails the send silently'
);

select is(
  (
    select count(*) from net.http_request_queue
    where url like 'https://pgflow-telemetry.workers.dev%'
  ),
  0::bigint,
  'failed send rolls the pg_net queue insert back'
);

select is(
  (select count(*) from pgflow_telemetry.sent_reports),
  0::bigint,
  'failed send writes no audit row'
);

-- Query cancellation inside the send block stays silent, not a crash.
create or replace function pgflow_telemetry.tests_block_audit() returns trigger
language plpgsql
as $fn$
begin
  raise exception 'simulated cancellation' using errcode = '57014';
end
$fn$;

select is(
  pgflow_telemetry.report(),
  'error: canceled',
  'query cancellation during the send is handled, not propagated'
);

drop trigger tests_block_audit on pgflow_telemetry.sent_reports;
drop function pgflow_telemetry.tests_block_audit();
select set_config(
  'app.settings.jwt_secret',
  'super-secret-jwt-token-with-at-least-32-characters-long',
  true
);

select pgflow_telemetry.enable();
select is(
  (
    select command from cron.job where jobname = 'pgflow_telemetry_report'
  ),
  'begin; set local statement_timeout = ''5 s''; select pgflow_telemetry.report(); commit;',
  'enable() schedules the same timeout-wrapped command as the migration'
);

select is(
  (
    select r.jobid from pgflow_telemetry.job_registry r
    where r.jobname = 'pgflow_telemetry_report'
  ),
  (
    select jobid from cron.job where jobname = 'pgflow_telemetry_report'
  ),
  'enable() registers the job id it scheduled'
);

select pgflow_telemetry.disable();
select ok(
  not exists (
    select 1 from cron.job
    where jobname = 'pgflow_telemetry_report'
  ),
  'disable() removes the cron job (the switch)'
);

select is(
  (select count(*) from pgflow_telemetry.job_registry),
  0::bigint,
  'disable() removes the registry row with the job'
);

select lives_ok(
  $$select pgflow_telemetry.disable()$$,
  'disable() with no scheduled job stays idempotent'
);

-- Permission failures must stay visible: a role without cron schema access
-- cannot unschedule, so disable() must raise instead of reporting success.
-- postgres is a member of authenticated (no GRANT needed; granting inside
-- this PostgreSQL build segfaults, verified in correction-1 evidence).
grant usage on schema pgflow_telemetry to authenticated;
grant execute on function pgflow_telemetry.disable() to authenticated;
grant select on pgflow_telemetry.job_registry to authenticated;
set local role authenticated;

select throws_ok(
  $$select pgflow_telemetry.disable()$$,
  '42501',
  'permission denied for schema cron',
  'disable() propagates cron permission errors'
);

reset role;

-- Regression (correction 2): a failure inside the initial gates (inactive
-- day, already reported, local check) must return an error status, never
-- escape report(). The local gate is replaced transactionally with a
-- SQLSTATE 57014 raiser, mirroring query cancellation; rollback restores
-- it. The fixture day is active, so the call reaches the replaced gate
-- without ever sending HTTP.
create or replace function pgflow.is_local()
returns boolean
language plpgsql
as $fn$
begin
  raise exception 'simulated cancellation' using errcode = '57014';
end
$fn$;

select is(
  pgflow_telemetry.report(),
  'error: canceled',
  'query cancellation inside the initial gates is handled, not propagated'
);

select is(
  (select count(*) from pgflow_telemetry.sent_reports),
  0::bigint,
  'canceled gate check writes no audit row'
);

-- Correction 3: an ordinary (non-cancellation) exception inside the
-- initial gates must also return an error status, write no audit row, and
-- queue no HTTP request. Red against the pre-correction report body where
-- the gates sat outside every exception handler and failures escaped
-- report() entirely.
create or replace function pgflow.is_local()
returns boolean
language plpgsql
as $fn$
begin
  raise exception 'simulated ordinary gate failure';
end
$fn$;

select is(
  pgflow_telemetry.report(),
  'error: gate failed',
  'ordinary gate failure is handled, not propagated'
);

select is(
  (select count(*) from pgflow_telemetry.sent_reports),
  0::bigint,
  'ordinary gate failure writes no audit row'
);

select is(
  (
    select count(*) from net.http_request_queue
    where url like 'https://pgflow-telemetry.workers.dev%'
  ),
  0::bigint,
  'ordinary gate failure queues no HTTP request'
);

select finish();
rollback;

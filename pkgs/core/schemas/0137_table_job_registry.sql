-- Reconciliation record for telemetry cron jobs pgflow itself scheduled.
-- cron.job uses row security (username = CURRENT_USER), so a job scheduled
-- by one role is invisible to every other role: cron.unschedule then reports
-- "could not find valid entry" both for an absent job and for a job another
-- role still owns. This row alone proves nothing either way (a manually
-- scheduled job leaves no row; an externally unscheduled job leaves a stale
-- one): pgflow_telemetry.job_is_scheduled() is the authoritative existence
-- check, and this table records what pgflow scheduled so disable() can
-- reconcile it. Written in the same transaction as the cron.schedule call
-- (initial migration or enable()), removed with the unschedule in disable().
create table pgflow_telemetry.job_registry (
  jobname text primary key,
  jobid bigint not null,
  created_at timestamptz not null default now()
);

comment on table pgflow_telemetry.job_registry is
'Record of telemetry cron jobs pgflow scheduled; reconciled by disable() while job_is_scheduled() proves existence';

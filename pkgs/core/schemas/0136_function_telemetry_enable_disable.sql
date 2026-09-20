-- Privileged, narrowly scoped existence check for the one telemetry cron
-- job. cron.job enforces row security (username = CURRENT_USER), so a job
-- scheduled by another role is invisible to ordinary callers and
-- cron.unschedule reports an absent job and a foreign-owned job
-- identically ("could not find valid entry"). This function runs with
-- definer privileges so disable() can prove actual cross-owner existence
-- instead of guessing from the job registry.
--
-- SECURITY DEFINER alone does not bypass row security: if cron.job row
-- security still applies to the definer, the existence query below is
-- visibility-limited and "no rows" cannot distinguish an absent job from
-- a foreign-owned one. So the function first proves that its own owner
-- sees all cron.job rows -- superusers and BYPASSRLS roles always do; the
-- cron.job owner and roles that inherit its privileges do unless FORCE
-- ROW LEVEL SECURITY applies (mere membership is not enough: a NOINHERIT
-- member has no usable owner privileges, so pg_has_role 'usage' is the
-- proof, not 'member'); with row security disabled on cron.job every role
-- does -- and refuses to answer otherwise, with the exact operator fix in
-- the error.
-- Capability is never granted here: BYPASSRLS, superuser, and ownership
-- changes stay the operator's call. All catalog references are
-- pg_catalog-qualified under the pinned empty search_path; no role name
-- is assumed.
--
-- Security boundaries:
-- - accepts no arguments: the job name is fixed, so the function exposes
--   one bit ("is telemetry scheduled?"), never general cron data;
-- - it only reads: no caller gains the power to schedule, unschedule, or
--   inspect other jobs' schedules, commands, or owners;
-- - search_path = '' with fully qualified names resists object shadowing.
-- The normal Supabase install path (migration owner postgres, BYPASSRLS)
-- passes the capability proof; a vanilla install whose migration owner
-- cannot see across cron.job row security gets a visible, actionable
-- error instead of a silently broken opt-out.
create or replace function pgflow_telemetry.job_is_scheduled()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $check$
declare
  v_capable boolean;
  v_job_owner text;
begin
  select
    (not c.relrowsecurity)
    or r.rolsuper
    or r.rolbypassrls
    or (
      not c.relforcerowsecurity
      and pg_catalog.pg_has_role(current_user, c.relowner, 'usage')
    ),
    pg_catalog.pg_get_userbyid(c.relowner)
    into v_capable, v_job_owner
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  cross join pg_catalog.pg_roles r
  where n.nspname = 'cron'
    and c.relname = 'job'
    and r.rolname = current_user;

  if not coalesce(v_capable, false) then
    -- Fail closed: absence cannot be proven from a visibility-limited
    -- query, so telemetry must stay ENABLED until an operator makes the
    -- helper's owner capable. Never grant privileges here dynamically.
    raise exception using message = pg_catalog.format(
      'pgflow telemetry: cannot prove the telemetry job absent: pgflow_telemetry.job_is_scheduled() owner %L is subject to cron.job row security; fix: ALTER FUNCTION pgflow_telemetry.job_is_scheduled() OWNER TO a superuser or BYPASSRLS role or a role that inherits the cron.job owner %L privileges, then rerun pgflow_telemetry.disable()',
      current_user,
      v_job_owner
    );
  end if;

  return exists (
    select 1 from cron.job j
    where j.jobname = 'pgflow_telemetry_report'
  );
end
$check$;

-- The cron.job row is the enabled switch. disable() succeeds only after
-- proving through job_is_scheduled() that the telemetry job is actually
-- absent across owners: cron.job row security can hide a foreign-owned job
-- from both the caller and cron.unschedule, and the registry alone cannot
-- prove anything (a manually scheduled job leaves no row; an externally
-- unscheduled job leaves a stale one). job_is_scheduled() fails closed
-- while its own definer cannot see across cron.job row security, so
-- disable() inherits that failure instead of trusting a guess. A caller
-- who cannot remove an existing job fails visibly with the job untouched;
-- a successful disable reconciles the registry row. An advisory
-- transaction lock serializes concurrent enable()/disable() pairs so no
-- schedule can interleave between their check and their registry write.
-- External writers that schedule the job name outside pgflow while
-- bypassing the lock can still race the final check; disable() then
-- reports what the committed state showed at check time.
create or replace function pgflow_telemetry.disable()
returns void
language plpgsql
set search_path = ''
as $disable$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('pgflow_telemetry_report')
  );

  begin
    perform cron.unschedule('pgflow_telemetry_report');
  exception when others then
    if position('could not find valid entry for job' in sqlerrm) = 0 then
      -- Permission and other cron failures stay visible: a broken opt-out
      -- must never report success silently.
      raise;
    end if;
    -- cron.unschedule found no job for the current role. That is either a
    -- genuinely absent job (idempotent disable) or a job scheduled by
    -- another role that row security hides from unschedule. Only the
    -- privileged check separates the two.
  end;

  if pgflow_telemetry.job_is_scheduled() then
    raise exception 'pgflow telemetry: cannot disable: job pgflow_telemetry_report is still scheduled by another role and stays ENABLED; run pgflow_telemetry.disable() as the role that installed pgflow';
  end if;

  -- Absence proven (after the caller's own unschedule above, other roles
  -- can still hold the same jobname, which the check above caught):
  -- reconcile any stale registry row and finish.
  delete from pgflow_telemetry.job_registry
  where jobname = 'pgflow_telemetry_report';
end
$disable$;

-- The command wraps report() with `set local statement_timeout` at the cron
-- boundary because PostgreSQL does not arm a statement_timeout changed
-- inside a running function (verified against 17.6; see
-- telemetry-evidence/correction-1). The initial migration schedules the
-- exact same command. enable() takes the same advisory lock as disable()
-- so concurrent enable/disable calls serialize per transaction.
create or replace function pgflow_telemetry.enable()
returns void
language plpgsql
set search_path = ''
as $enable$
declare
  v_jobid bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('pgflow_telemetry_report')
  );

  perform pgflow_telemetry.disable();
  v_jobid := cron.schedule(
    'pgflow_telemetry_report',
    '17 3 * * *',
    $cron$begin; set local statement_timeout = '5 s'; select pgflow_telemetry.report(); commit;$cron$
  );
  insert into pgflow_telemetry.job_registry (jobname, jobid)
  values ('pgflow_telemetry_report', v_jobid)
  on conflict (jobname) do update
    set jobid = excluded.jobid, created_at = now();
end
$enable$;

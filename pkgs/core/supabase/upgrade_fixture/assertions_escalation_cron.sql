-- Assertions for the escalation cron upgrade fixture (#689).
-- __CASE__ expands to active | paused | absent.

do $$
declare
  v_recovery record;
  v_escalation record;
begin
  if not exists (
    select 1 from cron.job as other_job
    where other_job.jobname = 'pgflow_requeue_stalled_tasks'
      and other_job.username = 'fixture_other_cron_owner'
      and other_job.schedule = '55 seconds'
      and not other_job.active
  ) or exists (
    select 1 from cron.job as other_job
    where other_job.jobname = 'pgflow_escalate_permanently_stalled'
      and other_job.username = 'fixture_other_cron_owner'
  ) then
    raise exception '__CASE__: upgrade changed jobs for the unrelated cron owner';
  end if;

  select job.jobid, job.schedule, job.active into v_recovery
  from cron.job as job
  where job.jobname = 'pgflow_requeue_stalled_tasks'
    and job.username = current_user
    and job.database = current_database();

  select job.jobid, job.schedule, job.active into v_escalation
  from cron.job as job
  where job.jobname = 'pgflow_escalate_permanently_stalled'
    and job.username = current_user
    and job.database = current_database();

  -- The recovery job itself is never rescheduled or toggled by the upgrade.
  if v_recovery.jobid is null then
    if '__CASE__' = 'absent' then
      if v_escalation.jobid is not null then
        raise exception 'absent recovery: escalation job was scheduled anyway';
      end if;
      raise notice 'PASS: absent recovery schedules no escalation job';
      return;
    end if;
    raise exception '__CASE__: recovery job disappeared during upgrade';
  end if;

  if v_recovery.schedule <> '45 seconds' then
    raise exception '__CASE__: recovery schedule changed to %', v_recovery.schedule;
  end if;

  if v_escalation.jobid is null then
    raise exception '__CASE__: escalation job missing';
  end if;

  if v_escalation.schedule <> v_recovery.schedule then
    raise exception '__CASE__: escalation schedule % does not copy recovery %',
      v_escalation.schedule, v_recovery.schedule;
  end if;

  if '__CASE__' = 'active' then
    if not v_recovery.active then
      raise exception 'active: recovery job was paused by the upgrade';
    end if;
    if not v_escalation.active then
      raise exception 'active: escalation job is not active';
    end if;
  else
    if v_recovery.active then
      raise exception 'paused: recovery job was activated by the upgrade';
    end if;
    if v_escalation.active then
      raise exception 'paused: escalation job is active despite paused recovery';
    end if;
  end if;

  raise notice 'PASS: __CASE__ recovery state preserved and mirrored onto escalation';
end $$;

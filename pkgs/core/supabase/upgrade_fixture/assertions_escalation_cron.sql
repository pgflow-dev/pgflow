-- Assertions for the escalation cron upgrade fixture (#689).
-- __CASE__ expands to active | paused | absent.

do $$
declare
  v_recovery record;
  v_escalation record;
begin
  select jobid, schedule, active into v_recovery
  from cron.job
  where cron.job.jobname = 'pgflow_requeue_stalled_tasks';

  select jobid, schedule, active into v_escalation
  from cron.job
  where cron.job.jobname = 'pgflow_escalate_permanently_stalled';

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

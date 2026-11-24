-- Terminalize permanently stalled tasks through the step's when_exhausted
-- policy (#689). requeue_stalled_tasks() archives the message and stamps
-- permanently_stalled_at but leaves the task nonterminal; this function hands
-- each marked task to fail_task(), which treats the marker as exhaustion and
-- decides whether the run fails, the step skips, dependents start, and
-- siblings are cancelled or archived.
--
-- Lock order matches fail_task(): lock the run and step first, then the task,
-- so recovery (which locks step_tasks first) and live workers cannot deadlock.
-- The candidate loop is a deliberate exception to the declarative-first SQL
-- style: each candidate needs its own lock-and-recheck sequence before
-- fail_task() runs, which a set operation cannot interleave.
-- Runs as its own cron job, in a separate transaction from recovery, so
-- recovery's locks are released before escalation begins. Safe to repeat:
-- candidates are rechecked under lock, and rows already terminalized by
-- fail_task() lose their nonterminal status and stop matching.
create or replace function pgflow.escalate_permanently_stalled()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_run_status text;
  v_step_status text;
  v_task_status text;
  v_stalled_at timestamptz;
  v_requeued_count int;
  v_escalated int := 0;
begin
  -- Pick up every marked nonterminal task, including marked queued leftovers
  -- requeued by older callbacks and rows stamped by earlier deployments
  for v_candidate in
    select
      st.run_id,
      st.step_slug,
      st.task_index
    from pgflow.step_tasks st
    where st.status in ('started', 'queued')
      and st.permanently_stalled_at is not null
    order by st.run_id, st.step_slug, st.task_index
  loop
    -- Lock and recheck the run and step: if either left 'started', that
    -- transition owns the task's terminal state and escalation must not
    -- fight it
    select r.status, step_state.status into v_run_status, v_step_status
    from pgflow.runs r
    join pgflow.step_states step_state on step_state.run_id = r.run_id
    where r.run_id = v_candidate.run_id
      and step_state.step_slug = v_candidate.step_slug
    for update of r, step_state;

    if v_run_status = 'started' and v_step_status = 'started' then
      -- Lock and recheck the task: recovery or a live callback may have
      -- transitioned it while this pass waited for the run and step locks
      select st.status, st.permanently_stalled_at, st.requeued_count
      into v_task_status, v_stalled_at, v_requeued_count
      from pgflow.step_tasks st
      where st.run_id = v_candidate.run_id
        and st.step_slug = v_candidate.step_slug
        and st.task_index = v_candidate.task_index
      for update;

      if v_task_status in ('started', 'queued') and v_stalled_at is not null then
        -- fail_task() treats the marker as exhaustion and applies
        -- when_exhausted; attempts_count stays untouched (#689)
        perform pgflow.fail_task(
          run_id => v_candidate.run_id,
          step_slug => v_candidate.step_slug,
          task_index => v_candidate.task_index,
          error_message => 'permanently stalled: worker did not report after '
            || v_requeued_count || ' requeues'
        );
        v_escalated := v_escalated + 1;
      end if;
    end if;
  end loop;

  return v_escalated;
end;
$$;

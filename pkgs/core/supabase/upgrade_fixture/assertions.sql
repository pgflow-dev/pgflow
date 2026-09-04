-- Upgrade fixture assertions: run AFTER the consolidated
-- task_lifecycle_hardening migration is applied to the seeded 0.15.0 database.
-- Plain DO-block asserts (the fixture container image has no pgTAP);
-- any failure raises, psql runs with ON_ERROR_STOP=1, the script exits non-zero.

do $$
declare
  v_status text;
  v_def text;
  v_count int;
  v_msg_id bigint;
  v_vt_diff int;
begin
  -- ==========================================
  -- Repair #638: active tasks under skipped steps became 'skipped'
  -- ==========================================
  select task.status into v_status
  from pgflow.step_tasks task
  join pgflow.runs run on run.run_id = task.run_id
  where run.flow_slug = 'fix_skip' and task.task_index = 0;
  if v_status is distinct from 'skipped' then
    raise exception 'fix_skip task 0: expected skipped, got %', v_status;
  end if;

  select task.status into v_status
  from pgflow.step_tasks task
  join pgflow.runs run on run.run_id = task.run_id
  where run.flow_slug = 'fix_skip' and task.task_index = 1;
  if v_status is distinct from 'skipped' then
    raise exception 'fix_skip task 1: expected skipped, got %', v_status;
  end if;

  -- ==========================================
  -- Repair #645: unfinished tasks under failed runs became 'cancelled'
  -- ==========================================
  select task.status into v_status
  from pgflow.step_tasks task
  join pgflow.runs run on run.run_id = task.run_id
  where run.flow_slug = 'fix_fail' and task.task_index = 0;
  if v_status is distinct from 'cancelled' then
    raise exception 'fix_fail task 0: expected cancelled, got %', v_status;
  end if;

  select task.status into v_status
  from pgflow.step_tasks task
  join pgflow.runs run on run.run_id = task.run_id
  where run.flow_slug = 'fix_fail' and task.task_index = 1;
  if v_status is distinct from 'cancelled' then
    raise exception 'fix_fail task 1: expected cancelled, got %', v_status;
  end if;

  -- ==========================================
  -- Repair order: skipped-step repair ran before failed-run cancellation,
  -- so the task under both a skipped step and a failed run is 'skipped'.
  -- ==========================================
  select task.status into v_status
  from pgflow.step_tasks task
  join pgflow.runs run on run.run_id = task.run_id
  where run.flow_slug = 'fix_both';
  if v_status is distinct from 'skipped' then
    raise exception 'fix_both task: expected skipped (repair order), got %', v_status;
  end if;

  -- ==========================================
  -- Final constraint admits both 'skipped' and 'cancelled'
  -- ==========================================
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conname = 'valid_status'
    and conrelid = 'pgflow.step_tasks'::regclass;
  if v_def not like '%skipped%' or v_def not like '%cancelled%' then
    raise exception 'valid_status constraint missing terminal statuses: %', v_def;
  end if;
end $$;

-- ==========================================
-- Final runtime behavior: start_tasks() extends visibility end-to-end
-- ==========================================
select pgflow.create_flow('post_fix', null, null, 5);
select pgflow.add_step('post_fix', 'a', timeout => 7);
select pgflow.start_flow('post_fix', '"x"'::jsonb);

insert into pgflow.workers (worker_id, queue_name, function_name, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111', 'post_fix', 'test_worker', now());

create temp table fixture_msg as
select msg_id from pgmq.read('post_fix', 1, 1);

do $$
declare
  v_count int;
  v_vt_diff int;
begin
  perform pgflow.start_tasks(
    'post_fix',
    (select array_agg(msg_id) from fixture_msg),
    '11111111-1111-1111-1111-111111111111'::uuid
  );

  select count(*) into v_count
  from pgflow.step_tasks
  where flow_slug = 'post_fix'
    and status = 'started'
    and attempts_count = 1;
  if v_count <> 1 then
    raise exception 'post_fix: expected 1 started task with attempts_count 1, got %', v_count;
  end if;

  -- Effective visibility: step timeout 7 + 2 = 9 from claim time
  select extract(epoch from (q.vt - clock_timestamp()))::int into v_vt_diff
  from pgmq.q_post_fix q
  join pgflow.step_tasks st on st.message_id = q.msg_id
  where st.flow_slug = 'post_fix';
  if v_vt_diff < 7 or v_vt_diff > 11 then
    raise exception 'post_fix: expected vt within 2s of 9s, got %', v_vt_diff;
  end if;
end $$;

select 'PASS: 0.15.0 upgrade fixture (repairs + runtime)' as result;

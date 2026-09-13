-- 0.16.0 upgrade fixture assertions: run AFTER the persist_queue_identity
-- migration is applied to the seeded 0.16.0 database (#650).
-- Plain DO-block asserts (the fixture container has no pgTAP); any failure
-- raises, psql runs with ON_ERROR_STOP=1, the script exits non-zero.

do $$
declare
  v_count int;
  v_queue text;
begin
  -- ==========================================
  -- Backfill: every step routes to lower(flow_slug)
  -- ==========================================
  select count(*) into v_count
  from pgflow.steps
  where queue_name is distinct from lower(flow_slug);
  if v_count <> 0 then
    raise exception 'steps backfill: % rows without the canonical queue name', v_count;
  end if;

  -- Every task (including NULL message_id rows) carries the snapshot
  if (select count(*) from pgflow.step_tasks where queue_name is null) <> 0 then
    raise exception 'step_tasks backfill: rows without a queue name';
  end if;

  select count(*) into v_count
  from pgflow.step_tasks st
  join pgflow.runs r on r.run_id = st.run_id
  where st.queue_name is distinct from lower(r.flow_slug);
  if v_count <> 0 then
    raise exception 'step_tasks backfill: % rows with a wrong queue name', v_count;
  end if;

  -- Exact bigint identity preserved
  if (select count(*) from pgflow.step_tasks where message_id = 9223372036854775807) <> 1 then
    raise exception 'message id beyond the safe integer range was not preserved exactly';
  end if;

  -- Constraints are installed
  if not exists (
    select 1 from pg_constraint
    where conname = 'queue_name_is_valid' and conrelid = 'pgflow.steps'::regclass
  ) then
    raise exception 'steps queue_name_is_valid constraint missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'queue_name_is_valid' and conrelid = 'pgflow.step_tasks'::regclass
  ) then
    raise exception 'step_tasks queue_name_is_valid constraint missing';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'idx_step_tasks_queue_message' and n.nspname = 'pgflow'
  ) then
    raise exception 'queue/message unique index missing';
  end if;
end $$;

-- ==========================================
-- Runtime after upgrade: legacy mixed-case queue stays usable end to end
-- ==========================================
select queue_name into temporary fixture_mixed_queue
from pgflow.step_tasks st
join pgflow.runs r on r.run_id = st.run_id
where r.flow_slug = 'MixedCaseFlow'
limit 1;

do $$
declare
  v_queue text;
begin
  select queue_name into v_queue from fixture_mixed_queue;
  if v_queue is distinct from 'mixedcaseflow' then
    raise exception 'mixed-case flow stores canonical name, got %', v_queue;
  end if;
end $$;

-- Dispatch through the resolved original spelling
select pgflow.start_flow('MixedCaseFlow', '[30]'::jsonb);

do $$
declare
  v_count int;
begin
  -- The new run's messages landed on the physical mixed-case queue
  select count(*) into v_count
  from pgmq.q_MixedCaseFlow q
  join pgflow.step_tasks st on st.queue_name = 'mixedcaseflow' and st.message_id = q.msg_id
  join pgflow.runs r on r.run_id = st.run_id
  where r.status = 'started';
  if v_count < 1 then
    raise exception 'post-upgrade dispatch did not reach the physical mixed-case queue';
  end if;
end $$;

-- Claim through the polled spelling and complete into the physical archive
create temp table fixture_claim as
select msg_id from pgmq.read('MixedCaseFlow', 30, 10);

select pgflow.start_tasks(
  'MixedCaseFlow',
  (select array_agg(msg_id) from fixture_claim),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'MixedCaseFlow'
);

do $$
declare
  r record;
begin
  for r in
    select run_id, task_index
    from pgflow.step_tasks
    where flow_slug = 'MixedCaseFlow' and status = 'started'
    order by run_id, task_index
  loop
    perform pgflow.complete_task(r.run_id, 'a', r.task_index, null);
  end loop;

  if (select count(*) from pgflow.step_tasks
      where flow_slug = 'MixedCaseFlow' and status = 'started') <> 0 then
    raise exception 'post-upgrade completion left started tasks';
  end if;

  if (select count(*) from pgmq.a_MixedCaseFlow) <> 3 then
    raise exception 'post-upgrade archive missed the physical mixed-case queue';
  end if;
end $$;

-- Deletion drops the queue through its persisted route and original spelling
select pgflow.delete_flow_and_data('MixedCaseFlow');

do $$
begin
  if exists (select 1 from pgmq.list_queues() where lower(queue_name) = 'mixedcaseflow') then
    raise exception 'delete_flow_and_data did not drop the mixed-case queue';
  end if;
end $$;

-- Plain flow startup and execution after upgrade: verification and a claim
do $$
declare
  v_result jsonb;
  v_ids bigint[];
begin
  select pgflow.ensure_flow_compiled('plain_flow', jsonb_build_object('steps', jsonb_build_array(
    jsonb_build_object(
      'slug', 'a',
      'stepType', 'map',
      'dependencies', '[]'::jsonb,
      'requiredInputPattern', jsonb_build_object('defined', false),
      'forbiddenInputPattern', jsonb_build_object('defined', false)
    )
  ))) into v_result;
  if v_result->>'status' is distinct from 'verified' then
    raise exception 'plain flow startup verification failed: %', v_result;
  end if;

  select array_agg(msg_id) into v_ids from pgmq.read('plain_flow', 30, 1);
  perform pgflow.start_tasks(
    'plain_flow',
    v_ids,
    '11111111-1111-1111-1111-111111111111'::uuid
  );

  if (select count(*) from pgflow.step_tasks
      where flow_slug = 'plain_flow' and status = 'started') <> 2 then
    raise exception 'plain flow execution after upgrade did not claim the queued task';
  end if;
end $$;

select 'PASS: 0.16.0 upgrade fixture (backfill + runtime)' as result;

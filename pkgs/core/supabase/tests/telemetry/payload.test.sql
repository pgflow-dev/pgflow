begin;
select plan(13);

select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');
select pgflow_tests.setup_flow('two_roots');

-- Two active flows yesterday (3 steps each) with distinct short run durations.
select run_id from pgflow.start_flow('sequential', '{}'::jsonb);
select run_id from pgflow.start_flow('two_roots', '{}'::jsonb);

with numbered as (
  select run_id, row_number() over (order by run_id) as n from pgflow.runs
)
update pgflow.runs r
set started_at = current_date - 1 + interval '1 hour',
    completed_at = current_date - 1 + interval '1 hour'
      + numbered.n * interval '100 milliseconds'
from numbered
where r.run_id = numbered.run_id;

insert into pgflow.workers (worker_id, queue_name, function_name, started_at, pgflow_version)
values
  -- Valid versions serialize; 0.17.0 starts twice -> count bucket 2-3.
  (gen_random_uuid(), 'sequential', 'w', current_date - 1 + interval '2 hours', '0.17.0'),
  (gen_random_uuid(), 'sequential', 'w', current_date - 1 + interval '3 hours', '0.17.0'),
  (gen_random_uuid(), 'sequential', 'w', current_date - 1 + interval '3 hours', '0.17.1-beta.1'),
  -- Prefix-matching free text must never enter the payload.
  (gen_random_uuid(), 'sequential', 'w', current_date - 1 + interval '4 hours', '1.2.3 private-hostname'),
  -- Receiver caps every bucket string at 32 characters; the sender must too.
  (gen_random_uuid(), 'sequential', 'w', current_date - 1 + interval '5 hours', '1.2.3-' || repeat('x', 40));

-- worker_starts_per_function: one function with 2 starts, one with 3.
-- Both raw counts land in the 2-3 bucket, so exactly one contribution remains.
insert into pgflow.workers (worker_id, queue_name, function_name, started_at, pgflow_version)
select gen_random_uuid(), 'sequential', case when g <= 2 then 'fa' else 'fb' end,
  current_date - 1 + interval '6 hours', '0.18.0'
from generate_series(1, 5) g;

-- map_task_count: map steps with initial_tasks 2 and 3 (both in 2-3 bucket).
update pgflow.step_states
set status = 'started', initial_tasks = 2,
  created_at = current_date - 1 + interval '89 minutes',
  started_at = current_date - 1 + interval '90 minutes'
where run_id = (select run_id from pgflow.runs where flow_slug = 'sequential' limit 1)
  and step_slug = 'first';

update pgflow.step_states
set status = 'started', initial_tasks = 3,
  created_at = current_date - 1 + interval '90 minutes',
  started_at = current_date - 1 + interval '91 minutes'
where run_id = (select run_id from pgflow.runs where flow_slug = 'two_roots' limit 1)
  and step_slug = 'root_a';

-- step_wall_duration: two raw step durations (100 ms and 200 ms) map to
-- the same emitted bucket. Red against raw-value grouping, which would
-- emit two entries of count 1 instead of one combined contribution.
update pgflow.step_states
set status = 'completed',
  remaining_tasks = 0,
  created_at = current_date - 1 + interval '69 minutes',
  started_at = current_date - 1 + interval '70 minutes',
  completed_at = current_date - 1 + interval '70 minutes 100 milliseconds'
where run_id = (select run_id from pgflow.runs where flow_slug = 'sequential' limit 1)
  and step_slug = 'first';

update pgflow.step_states
set status = 'completed',
  remaining_tasks = 0,
  created_at = current_date - 1 + interval '70 minutes',
  started_at = current_date - 1 + interval '71 minutes',
  completed_at = current_date - 1 + interval '71 minutes 200 milliseconds'
where run_id = (select run_id from pgflow.runs where flow_slug = 'two_roots' limit 1)
  and step_slug = 'root_a';

select is(
  pgflow_telemetry.preview(current_date - 1) -> 'schema',
  '1'::jsonb,
  'payload carries schema version 1'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
    '[{"metric":"active_db_day","bucket":"yes"}]'::jsonb,
  'active day reports active_db_day'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
    '[{"metric":"workers_by_version","bucket":"0.17.0","count":"2-3"}]'::jsonb,
  'workers_by_version buckets the day starts'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
    '[{"metric":"workers_by_version","bucket":"0.17.1-beta.1","count":"1"}]'::jsonb,
  'full semver prerelease passes the version filter'
);

select is(
  (
    select count(*) from jsonb_array_elements(
      pgflow_telemetry.preview(current_date - 1) -> 'contributions'
    ) e
    where e->>'metric' = 'workers_by_version'
  ),
  3::bigint,
  'prefix-matched free text and overlong versions never serialize'
);

select is(
  (
    select count(*) from jsonb_array_elements(
      pgflow_telemetry.preview(current_date - 1) -> 'contributions'
    ) e
    where e->>'bucket' like '%private%'
  ),
  0::bigint,
  'no free text reaches any bucket'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
      '[{"metric":"steps_per_flow","bucket":"2-3","count":"2-3"}]'::jsonb
    and (
      select count(*) from jsonb_array_elements(
        pgflow_telemetry.preview(current_date - 1) -> 'contributions'
      ) e
      where e->>'metric' = 'steps_per_flow'
    ) = 1,
  'two 3-step flows collapse into one steps_per_flow bucket entry'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
      '[{"metric":"worker_starts_per_function","bucket":"2-3","count":"2-3"}]'::jsonb
    and (
      select count(*) from jsonb_array_elements(
        pgflow_telemetry.preview(current_date - 1) -> 'contributions'
      ) e
      where e->>'metric' = 'worker_starts_per_function'
    ) = 2,
  'starts of 2 and 3 collapse into one worker_starts_per_function bucket entry'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
      '[{"metric":"run_wall_duration","bucket":"100-999ms","count":"2-3"}]'::jsonb
    and (
      select count(*) from jsonb_array_elements(
        pgflow_telemetry.preview(current_date - 1) -> 'contributions'
      ) e
      where e->>'metric' = 'run_wall_duration'
    ) = 1,
  'runs of 100 ms and 200 ms collapse into one duration bucket entry'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
      '[{"metric":"step_wall_duration","bucket":"100-999ms","count":"2-3"}]'::jsonb
    and (
      select count(*) from jsonb_array_elements(
        pgflow_telemetry.preview(current_date - 1) -> 'contributions'
      ) e
      where e->>'metric' = 'step_wall_duration'
    ) = 1,
  'step durations of 100 ms and 200 ms collapse into one bucket entry'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
      '[{"metric":"map_task_count","bucket":"2-3","count":"2-3"}]'::jsonb
    and (
      select count(*) from jsonb_array_elements(
        pgflow_telemetry.preview(current_date - 1) -> 'contributions'
      ) e
      where e->>'metric' = 'map_task_count'
    ) = 1,
  'map fan-outs of 2 and 3 collapse into one map_task_count bucket entry'
);

select is(
  (
    select count(*) from jsonb_array_elements(
      pgflow_telemetry.preview(current_date - 1) -> 'contributions'
    ) e
  ),
  (
    select count(distinct (e->>'metric') || '|' || (e->>'bucket')) from jsonb_array_elements(
      pgflow_telemetry.preview(current_date - 1) -> 'contributions'
    ) e
  ),
  'payload contains no duplicate metric/bucket pairs'
);

select ok(
  not (
    pgflow_telemetry.preview(current_date - 30) -> 'contributions' @>
    '[{"metric":"active_db_day","bucket":"yes"}]'::jsonb
  ),
  'inactive day reports no active_db_day'
);

select finish();
rollback;

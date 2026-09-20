begin;
select plan(7);

select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Reviewer worst case: 65 runs with distinct 1..65 ms wall durations.
-- Direct inserts: repeated start_flow inside one statement keeps only the
-- first run, and telemetry only reads run timestamps.
insert into pgflow.runs (run_id, flow_slug, input, remaining_steps, status, started_at, completed_at)
select gen_random_uuid(), 'sequential', '{}'::jsonb, 0, 'completed',
  current_date - 1 + interval '1 hour',
  current_date - 1 + interval '1 hour' + g * interval '1 millisecond'
from generate_series(1, 65) g;

-- 70 distinct valid versions: more contributions than the receiver accepts.
insert into pgflow.workers (worker_id, queue_name, function_name, started_at, pgflow_version)
select gen_random_uuid(), 'sequential', 'w', current_date - 1 + interval '2 hours',
  format('1.2.%s', g)
from generate_series(0, 69) g;

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
      '[{"metric":"run_wall_duration","bucket":"<100ms","count":"64-127"}]'::jsonb
    and (
      select count(*) from jsonb_array_elements(
        pgflow_telemetry.preview(current_date - 1) -> 'contributions'
      ) e
      where e->>'metric' = 'run_wall_duration'
    ) = 1,
  '65 distinct millisecond durations collapse into one bucket entry'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
    '[{"metric":"run_outcomes","bucket":"completed","count":"64-127"}]'::jsonb,
  'dense day counts the completed runs'
);

select ok(
  jsonb_array_length(pgflow_telemetry.preview(current_date - 1) -> 'contributions') <= 64,
  'sender never emits more than 64 contributions'
);

select ok(
  octet_length(pgflow_telemetry.preview(current_date - 1)::text) <= 2048,
  'sender never emits more than 2048 UTF-8 bytes'
);

select ok(
  pgflow_telemetry.preview(current_date - 1) -> 'contributions' @>
    '[{"metric":"active_db_day","bucket":"yes"}]'::jsonb,
  'active_db_day survives truncation (highest priority)'
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
  'bounded payload contains no duplicate metric/bucket pairs'
);

select is(
  pgflow_telemetry.preview(current_date - 1) = pgflow_telemetry.preview(current_date - 1),
  true,
  'bounding is deterministic across builds'
);

select finish();
rollback;

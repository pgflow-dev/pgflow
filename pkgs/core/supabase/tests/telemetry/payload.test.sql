begin;
select plan(5);

select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');
select pgflow.start_flow('sequential', '{}'::jsonb);

-- Shift the fixture into yesterday's window: telemetry only reports on
-- completed days. Mutating timestamps is the otherwise unreachable state.
update pgflow.runs
  set started_at = current_date - 1 + interval '1 hour';

insert into pgflow.workers (worker_id, queue_name, function_name, started_at, pgflow_version)
values
  (gen_random_uuid(), 'sequential', 'sequential-worker', current_date - 1 + interval '2 hours', '0.17.0'),
  (gen_random_uuid(), 'sequential', 'sequential-worker', current_date - 1 + interval '3 hours', '0.17.0');

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
    '[{"metric":"steps_per_flow","bucket":"2-3","count":"1"}]'::jsonb,
  'sequential flow (3 steps) lands in the 2-3 bucket'
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

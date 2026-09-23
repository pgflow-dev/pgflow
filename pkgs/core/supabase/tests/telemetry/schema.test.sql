begin;
select plan(10);

select pgflow_tests.reset_db();

select ok(
  exists (select 1 from pg_namespace where nspname = 'pgflow_telemetry'),
  'pgflow_telemetry schema exists'
);

select is(
  (
    select count(*) from information_schema.columns
    where table_schema = 'pgflow_telemetry' and table_name = 'sent_reports'
  ),
  4::bigint,
  'sent_reports has four columns'
);

select ok(
  exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'pgflow_telemetry' and c.relname = 'sent_reports' and i.indisprimary
  ),
  'sent_reports primary key enforces one row per day'
);

select is(pgflow_telemetry.bucket_count(0), '0', 'bucket_count 0');
select is(pgflow_telemetry.bucket_count(300), '256+', 'bucket_count 256+');
select is(pgflow_telemetry.bucket_steps(5), '4-7', 'bucket_steps 5');
select is(pgflow_telemetry.bucket_duration('9 seconds'::interval), '1-9.9s', 'bucket_duration 9s');
select is(pgflow_telemetry.bucket_duration('90 seconds'::interval), '1-4.9m', 'bucket_duration 90s');
select is(pgflow_telemetry.bucket_duration('3 days'::interval), '1-6d', 'bucket_duration 3d');

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'pgflow' and tablename = 'runs' and indexname = 'idx_runs_started_at'
  ),
  'runs(started_at) index exists for the daily scan'
);

select finish();
rollback;

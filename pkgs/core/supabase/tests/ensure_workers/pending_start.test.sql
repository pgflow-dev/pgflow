-- A request remains pending after the retry throttle passes, before readiness.
begin;
select plan(2);
select pgflow_tests.reset_db();
set local app.settings.jwt_secret = 'production-secret';
select vault.create_secret('test-key', 'supabase_service_role_key');
select vault.create_secret('testproject', 'supabase_project_id');
select pgflow.track_worker_function('slow-start');

select is(
  (select count(*) from pgflow.ensure_workers()),
  1::bigint,
  'queues the first startup request'
);

-- Initialization has not registered a worker. Advance past debounce without
-- waiting on the wall clock; the pending timeout must still prevent a retry.
update pgflow.worker_functions
set last_invoked_at = clock_timestamp() - interval '10 seconds'
where function_name = 'slow-start';

select is(
  (select count(*) from pgflow.ensure_workers()),
  0::bigint,
  'does not queue another request while initialization is pending beyond debounce'
);
select finish();
rollback;

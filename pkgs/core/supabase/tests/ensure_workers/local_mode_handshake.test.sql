-- Local development uses the same pending/readiness protocol as production.
begin;
select plan(4);
select pgflow_tests.reset_db();
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
select pgflow.track_worker_function('my-function');
insert into pgflow.workers (worker_id, queue_name, function_name)
values ('11111111-1111-1111-1111-111111111111', 'test_queue', 'my-function');
select is((select count(*) from pgflow.ensure_workers()), 0::bigint,
  'local cron does not invoke healthy functions');
update pgflow.workers set stopped_at = clock_timestamp()
where worker_id = '11111111-1111-1111-1111-111111111111';
update pgflow.worker_functions set last_invoked_at = clock_timestamp();
select is((select count(*) from pgflow.ensure_workers()), 0::bigint,
  'local cron preserves the retry throttle');
update pgflow.worker_functions set last_invoked_at = clock_timestamp() - interval '10 seconds';
select is((select count(*) from pgflow.ensure_workers()), 1::bigint,
  'local cron reserves startup for an unhealthy function');
update pgflow.worker_functions set last_invoked_at = clock_timestamp() - interval '10 seconds';
select is((select count(*) from pgflow.ensure_workers()), 0::bigint,
  'local cron does not replace pending startup after debounce');
select finish();
rollback;

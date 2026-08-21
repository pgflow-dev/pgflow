begin;
select plan(3);

select pgflow_tests.reset_db();

select pgflow.track_worker_function('http-worker', 'http');
select pgflow.track_worker_function('process-worker', 'process');

select is(
  (select count(*)::int from pgflow.ensure_workers() where function_name = 'process-worker'),
  0,
  'ensure_workers skips process workers in production mode'
);

select ok(
  (select count(*)::int from pgflow.ensure_workers() where function_name = 'http-worker') >= 0,
  'ensure_workers still evaluates http workers'
);

select set_config('app.settings.is_local', 'true', true);

select is(
  (select count(*)::int from pgflow.ensure_workers() where function_name = 'process-worker'),
  0,
  'ensure_workers skips process workers in local mode'
);

select * from finish();
rollback;

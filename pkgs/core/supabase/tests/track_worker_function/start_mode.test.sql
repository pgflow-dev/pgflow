begin;
select plan(4);

select pgflow_tests.reset_db();

select pgflow.track_worker_function('default-http-worker');

select is(
  (select start_mode from pgflow.worker_functions where function_name = 'default-http-worker'),
  'http',
  'track_worker_function defaults start_mode to http'
);

select pgflow.track_worker_function('process-worker', 'process');

select is(
  (select start_mode from pgflow.worker_functions where function_name = 'process-worker'),
  'process',
  'track_worker_function stores explicit process start_mode'
);

select pgflow.track_worker_function('mode-update-worker', 'http');
select pgflow.track_worker_function('mode-update-worker', 'process');

select is(
  (select start_mode from pgflow.worker_functions where function_name = 'mode-update-worker'),
  'process',
  'track_worker_function updates start_mode on conflict'
);

select throws_ok(
  $$ select pgflow.track_worker_function('invalid-worker', 'invalid') $$,
  'new row for relation "worker_functions" violates check constraint "worker_functions_start_mode_check"',
  'track_worker_function rejects unsupported start_mode values'
);

select * from finish();
rollback;

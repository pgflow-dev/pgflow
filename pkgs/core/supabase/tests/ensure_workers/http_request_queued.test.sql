-- Inspect the same enqueued batch; later cron calls must not replace pending requests.
begin;
select plan(6);
select pgflow_tests.reset_db();
select pgflow.track_worker_function('my-function');
select pgflow.track_worker_function('my-function-b');
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
create temporary table invocation as select * from pgflow.ensure_workers();
select is((select count(*) from invocation), 2::bigint, 'queues distinct function replicas');
select ok((select bool_and(request_id is not null) from invocation), 'returns queued request IDs');
select is((select count(distinct request_id) from invocation), 2::bigint, 'each replica has a unique request ID');
select results_eq(
  $$select url from net.http_request_queue where id in (select request_id from invocation) order by url$$,
  $$values ('http://kong:8000/functions/v1/my-function'::text), ('http://kong:8000/functions/v1/my-function-b'::text)$$,
  'addresses each distinct function name'
);
select ok((
  select bool_and(convert_from(q.body, 'UTF8')::jsonb->>'invocation_id' = wf.invocation_id::text)
  from invocation as i
  join net.http_request_queue as q on q.id = i.request_id
  join pgflow.worker_functions as wf on wf.function_name = i.function_name
), 'HTTP body carries the matching reserved invocation ID');
select is((select count(*) from pgflow.ensure_workers()), 0::bigint, 'another cron call cannot replace pending requests');
select finish();
rollback;

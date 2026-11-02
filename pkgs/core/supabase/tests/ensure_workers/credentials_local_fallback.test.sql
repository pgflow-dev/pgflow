begin;
select plan(4);
select pgflow_tests.reset_db();
delete from vault.secrets where name in ('supabase_service_role_key', 'supabase_project_id');
select pgflow.track_worker_function('my-function');
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
create temporary table invocation as select * from pgflow.ensure_workers();
select is((select count(*) from invocation), 1::bigint, 'local startup works without Vault credentials');
select ok((select request_id is not null from invocation), 'local startup returns the request ID');
select is((select url from net.http_request_queue where id = (select request_id from invocation)),
  'http://kong:8000/functions/v1/my-function', 'uses the local URL');
select ok((select headers->>'Authorization' is null from net.http_request_queue where id = (select request_id from invocation)),
  'local startup preserves the local authentication fallback');
select finish();
rollback;

-- Production credentials remain independent of the startup handshake.
begin;
select plan(4);
select pgflow_tests.reset_db();
select vault.create_secret('test-service-role-key-from-vault', 'supabase_service_role_key');
select vault.create_secret('vaultproject123', 'supabase_project_id');
select pgflow.track_worker_function('my-function');
set local app.settings.jwt_secret = 'production-secret';
create temporary table invocation as select * from pgflow.ensure_workers();
select is((select count(*) from invocation), 1::bigint, 'production Vault credentials enqueue startup');
select ok((select request_id is not null from invocation), 'returns the queued request ID');
select is((select url from net.http_request_queue where id = (select request_id from invocation)),
  'https://vaultproject123.supabase.co/functions/v1/my-function', 'uses the project ID from Vault');
select is((select headers->>'Authorization' from net.http_request_queue where id = (select request_id from invocation)),
  'Bearer test-service-role-key-from-vault', 'preserves service-role authentication');
select finish();
rollback;

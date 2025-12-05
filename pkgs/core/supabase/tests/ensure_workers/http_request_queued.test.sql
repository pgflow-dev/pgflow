-- Test: ensure_workers() queues HTTP request via pg_net
begin;
select plan(4);
select pgflow_tests.reset_db();

-- Clear any existing HTTP requests
delete from net._http_response;

-- Setup: Register a worker function
select pgflow.track_worker_function('my-function');

-- Set last_invoked_at to past (beyond debounce window)
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Simulate local mode (will use local fallback credentials)
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';

-- Execute ensure_workers() and capture request_id
with result as (
  select * from pgflow.ensure_workers()
)
select is(
  (select count(*) from result),
  1::bigint,
  'One function was invoked'
);

-- Check that an HTTP request was queued
-- Note: pg_net queues requests but doesn't execute until transaction commits
-- We check the internal request table to verify the request was created

-- TEST: Request was queued in net._http_response
-- Note: The request may be in a pending state in net's internal tables
-- For now, we verify the request_id returned is valid
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

with result as (
  select * from pgflow.ensure_workers()
)
select ok(
  (select request_id is not null from result limit 1),
  'HTTP request was queued (request_id returned)'
);

-- TEST: Multiple functions each get their own request
select pgflow.track_worker_function('function-two');
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

with result as (
  select * from pgflow.ensure_workers()
)
select is(
  (select count(distinct request_id) from result),
  2::bigint,
  'Each function gets its own request_id'
);

-- TEST: request_ids are unique
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

with result as (
  select * from pgflow.ensure_workers()
),
ids as (
  select request_id from result
)
select ok(
  (select count(*) = count(distinct request_id) from ids),
  'All request_ids are unique'
);

select finish();
rollback;

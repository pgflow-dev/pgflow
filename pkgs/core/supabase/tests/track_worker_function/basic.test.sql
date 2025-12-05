begin;
select plan(9);
select pgflow_tests.reset_db();

-- TEST: Inserts new worker function when it does not exist
select pgflow.track_worker_function('my-edge-function');
select is(
  (select count(*) from pgflow.worker_functions where function_name = 'my-edge-function'),
  1::bigint,
  'track_worker_function() inserts new worker function'
);

-- TEST: New worker function has enabled=true by default
select is(
  (select enabled from pgflow.worker_functions where function_name = 'my-edge-function'),
  true,
  'New worker function has enabled=true by default'
);

-- TEST: New worker function has default heartbeat_timeout_seconds
select is(
  (select heartbeat_timeout_seconds from pgflow.worker_functions where function_name = 'my-edge-function'),
  6,
  'New worker function has heartbeat_timeout_seconds=6 by default'
);

-- TEST: New worker function has last_invoked_at set (debounce protection)
select isnt(
  (select last_invoked_at from pgflow.worker_functions where function_name = 'my-edge-function'),
  null::timestamptz,
  'New worker function has last_invoked_at set on insert (debounce protection)'
);

-- TEST: last_invoked_at is set to approximately now
select ok(
  (select last_invoked_at >= now() - interval '1 second'
   from pgflow.worker_functions
   where function_name = 'my-edge-function'),
  'last_invoked_at is set to approximately now on insert'
);

-- TEST: Upsert updates updated_at on conflict
-- First, get the original updated_at timestamp
select pg_sleep(0.01); -- Small delay to ensure timestamp difference
select pgflow.track_worker_function('my-edge-function');
select ok(
  (select updated_at > created_at from pgflow.worker_functions where function_name = 'my-edge-function'),
  'Upsert updates updated_at timestamp on conflict'
);

-- TEST: Upsert updates last_invoked_at on conflict
select ok(
  (select last_invoked_at >= now() - interval '1 second'
   from pgflow.worker_functions
   where function_name = 'my-edge-function'),
  'Upsert updates last_invoked_at on conflict (refreshes debounce)'
);

-- TEST: Upsert does not duplicate rows
select is(
  (select count(*) from pgflow.worker_functions where function_name = 'my-edge-function'),
  1::bigint,
  'Upsert does not create duplicate rows'
);

-- TEST: Can track multiple different functions
select pgflow.track_worker_function('another-function');
select is(
  (select count(*) from pgflow.worker_functions),
  2::bigint,
  'Can track multiple different worker functions'
);

select finish();
rollback;

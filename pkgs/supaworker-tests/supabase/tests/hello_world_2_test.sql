BEGIN;
SELECT plan(23);

-- Test supaworker.on_worker_started
SELECT is(
    (SELECT count(*) FROM supaworker.workers),
    0::bigint,
    'workers table should start empty'
);

SELECT lives_ok(
    $$ SELECT supaworker.on_worker_started('test_queue') $$,
    'on_worker_started should execute successfully'
);

SELECT is(
    (SELECT count(*) FROM supaworker.workers),
    1::bigint,
    'on_worker_started should create one worker'
);

SELECT is(
    (SELECT queue_name FROM supaworker.workers LIMIT 1),
    'test_queue',
    'worker should have correct queue_name'
);

-- Test supaworker.send_heartbeat
SELECT lives_ok(
    $$ SELECT supaworker.send_heartbeat((SELECT worker_id FROM supaworker.workers LIMIT 1)) $$,
    'send_heartbeat should execute successfully without function name'
);

SELECT lives_ok(
    $$ SELECT supaworker.send_heartbeat((SELECT worker_id FROM supaworker.workers LIMIT 1), 'test_function') $$,
    'send_heartbeat should execute successfully with function name'
);

SELECT is(
    (SELECT edge_fn_name FROM supaworker.workers LIMIT 1),
    'test_function',
    'send_heartbeat should update edge_fn_name'
);

-- Test empty function name doesn't override existing
SELECT lives_ok(
    $$ SELECT supaworker.send_heartbeat((SELECT worker_id FROM supaworker.workers LIMIT 1), '') $$,
    'send_heartbeat should execute successfully with empty function name'
);

SELECT is(
    (SELECT edge_fn_name FROM supaworker.workers LIMIT 1),
    'test_function',
    'send_heartbeat with empty function name should not override existing edge_fn_name'
);

-- Test active_workers view
SELECT is(
    (SELECT count(*) FROM supaworker.active_workers),
    0::bigint,
    'active_workers should not show stopped workers'
);

-- Create a new active worker
SELECT supaworker.on_worker_started('active_queue');
SELECT supaworker.send_heartbeat((
    SELECT worker_id 
    FROM supaworker.workers 
    WHERE queue_name = 'active_queue'
));

SELECT is(
    (SELECT count(*) FROM supaworker.active_workers),
    1::bigint,
    'active_workers should show recently heartbeated workers'
);

-- Test inactive_workers view
-- First, create a worker that will become inactive
SELECT supaworker.on_worker_started('inactive_queue');

-- Force last_heartbeat_at to be old
UPDATE supaworker.workers 
SET last_heartbeat_at = now() - interval '10 seconds'
WHERE queue_name = 'inactive_queue';

SELECT is(
    (SELECT count(*) FROM supaworker.inactive_workers),
    1::bigint,
    'inactive_workers should show workers with old heartbeats'
);

-- Test spawn function

SELECT is(
    (SELECT supaworker.spawn('new_queue')),
    1,
    'spawn should return 1 when creating new worker'
);

SELECT is(
    (SELECT supaworker.spawn('new_queue')),
    0,
    'spawn should return 0 when worker exists'
);

-- Test read_with_poll function
-- First create a queue and add a message
SELECT pgmq.create('test_queue');
SELECT pgmq.send('test_queue', '{"test": "message"}'::jsonb);

-- Test with no conditional
SELECT lives_ok(
    $$ SELECT * FROM supaworker.read_with_poll('test_queue', 30, 1, 1) $$,
    'read_with_poll should execute without conditional'
);

-- Test with conditional that matches
SELECT lives_ok(
    $$ SELECT * FROM supaworker.read_with_poll('test_queue', 30, 1, 1, 100, '{"test": "message"}'::jsonb) $$,
    'read_with_poll should execute with matching conditional'
);

-- Test with conditional that doesn't match
SELECT is(
    (SELECT count(*) FROM supaworker.read_with_poll('test_queue', 30, 1, 1, 100, '{"test": "no_match"}'::jsonb)),
    0::bigint,
    'read_with_poll should return no results with non-matching conditional'
);

-- Test invalid queue name
SELECT throws_ok(
    $$ SELECT * FROM supaworker.read_with_poll('nonexistent_queue', 30, 1) $$,
    'read_with_poll should throw for nonexistent queue'
);

-- Test negative visibility timeout
SELECT throws_ok(
    $$ SELECT * FROM supaworker.read_with_poll('test_queue', -1, 1) $$,
    'read_with_poll should throw for negative visibility timeout'
);

-- Test zero quantity
SELECT throws_ok(
    $$ SELECT * FROM supaworker.read_with_poll('test_queue', 30, 0) $$,
    'read_with_poll should throw for zero quantity'
);

-- Test negative poll interval
SELECT throws_ok(
    $$ SELECT * FROM supaworker.read_with_poll('test_queue', 30, 1, 1, -1) $$,
    'read_with_poll should throw for negative poll interval'
);

SELECT finish();
ROLLBACK;

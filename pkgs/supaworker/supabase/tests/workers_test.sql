BEGIN;
SELECT plan(12);

DELETE FROM supaworker.workers;

-- Test initial state
SELECT is(
    (SELECT count(*) FROM supaworker.workers),
    0::bigint,
    'workers table should start empty'
);

SELECT is(
    (SELECT count(*) FROM supaworker.active_workers),
    0::bigint,
    'active_workers view should start empty'
);

SELECT is(
    (SELECT count(*) FROM supaworker.inactive_workers),
    0::bigint,
    'inactive_workers view should start empty'
);

-- Test on_worker_started()
SELECT lives_ok(
    $$ SELECT supaworker.on_worker_started('test_queue', gen_random_uuid(), 'test_function') $$,
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

-- Test multiple on_worker_started() calls
SELECT lives_ok(
    $$ SELECT supaworker.on_worker_started('test_queue_2', gen_random_uuid(), 'test_function_2') $$,
    'second on_worker_started should execute successfully'
);

SELECT is(
    (SELECT count(*) FROM supaworker.workers),
    2::bigint,
    'should have two workers after second on_worker_started'
);

-- Test worker becoming inactive
UPDATE supaworker.workers 
SET last_heartbeat_at = now() - interval '7 seconds'
WHERE queue_name = 'test_queue';

SELECT is(
    (SELECT count(*) FROM supaworker.inactive_workers),
    1::bigint,
    'should have one inactive worker after updating last_heartbeat_at'
);

-- Test send_heartbeat making worker active again
SELECT lives_ok(
    $$ SELECT supaworker.send_heartbeat((
        SELECT worker_id 
        FROM supaworker.workers 
        WHERE queue_name = 'test_queue'
    )) $$,
    'send_heartbeat should execute successfully'
);

SELECT is(
    (SELECT count(*) FROM supaworker.active_workers),
    2::bigint,
    'should have two active workers after send_heartbeat'
);

-- Test function_name is set correctly on worker creation
SELECT is(
    (
        SELECT function_name 
        FROM supaworker.workers 
        WHERE queue_name = 'test_queue'
    ),
    'test_function',
    'worker should have correct function_name from creation'
);

SELECT finish();
ROLLBACK;

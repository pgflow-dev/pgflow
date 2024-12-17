BEGIN;

-- Plan the number of tests
SELECT plan(2);

----- Setup
INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');

----- Test that find_run() throws for an invalid run ID
SELECT throws_like(
    $$ SELECT pgflow.find_run(gen_random_uuid()) $$,
    '%Run not found%',
    'find_run() throws an error for non-existent run_id'
);

INSERT INTO pgflow.runs (flow_slug, run_id, status, payload) VALUES (
    'test_flow', gen_random_uuid(), 'pending', '{}'::jsonb
);

SELECT is(
    (
        SELECT status
        FROM pgflow.find_run((SELECT run_id FROM pgflow.runs LIMIT 1))
    ),
    'pending',
    'find_run() returns a pending run'
);

----- Finish the test
SELECT finish();

ROLLBACK;

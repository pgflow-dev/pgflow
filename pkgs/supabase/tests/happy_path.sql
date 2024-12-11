BEGIN;

-- Plan the number of tests
SELECT plan(4);

SELECT pgflow_tests.load_flow('BasicFlow');
select pgflow_tests.mock_call_edgefn();

-- Step 2: Start the flow
SELECT * INTO TEMP TABLE test_run
FROM pgflow.run_flow('BasicFlow', '"run_payload"'::jsonb);

SELECT isnt_empty('SELECT * FROM test_run', 'Run successfully created');

SELECT is(
    (select count(*) from pgflow.step_states),
    1::bigint,
    'should create a step state'
    );

-- Extract run_id for use in subsequent steps
SELECT run_id INTO TEMP TABLE run_id FROM test_run;

-- Step 3: Complete steps in order
SELECT
    pgflow.complete_step((SELECT run_id FROM test_run), 'root', '"root ok"'::jsonb);
SELECT
    pgflow.complete_step((SELECT run_id FROM test_run), 'left', '"left ok"'::jsonb);
SELECT
    pgflow.complete_step((SELECT run_id FROM test_run), 'right', '"right ok"'::jsonb);
SELECT
    pgflow.complete_step((SELECT run_id FROM test_run), 'end', '"end ok"'::jsonb);

SELECT is(
    (SELECT array_agg(step_slug order by step_slug) FROM pgflow.step_states),
    array['end', 'left', 'right', 'root'],
    'start_step was called exactly once per each step'
);

select is(
    (SELECT count(*) FROM pgflow.step_tasks),
    4::bigint,
    '4 step tasks were created'
);

-- Finish
SELECT finish();

ROLLBACK;

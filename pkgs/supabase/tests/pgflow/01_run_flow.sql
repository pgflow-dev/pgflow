BEGIN;
SELECT plan(4);

---- precleanup phase
DELETE FROM pgflow.step_states WHERE flow_slug = '01_run_flow';
DELETE FROM pgflow.runs WHERE flow_slug = '01_run_flow';
DELETE FROM pgflow.deps WHERE flow_slug = '01_run_flow';
DELETE FROM pgflow.steps WHERE flow_slug = '01_run_flow';
DELETE FROM pgflow.flows WHERE flow_slug = '01_run_flow';

---- init phase ----------------
--------------------------------

INSERT INTO pgflow.flows (flow_slug) VALUES ('01_run_flow');

INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
('01_run_flow', 'root'),
('01_run_flow', 'left'),
('01_run_flow', 'right'),
('01_run_flow', 'end');

INSERT INTO pgflow.deps (flow_slug, from_step_slug, to_step_slug)
VALUES
('01_run_flow', 'root', 'left'),
('01_run_flow', 'root', 'right'),
('01_run_flow', 'left', 'end'),
('01_run_flow', 'right', 'end');

SELECT pgflow.run_flow(
    '01_run_flow',
    '{"input": "hello world"}'::jsonb
);

---- test phase ----------------
--------------------------------
SELECT is(
    (
        SELECT count(*)
        FROM pgflow.runs
        WHERE flow_slug = '01_run_flow'
    ),
    1::bigint,
    'should have 1 run'
);

SELECT is(
    (
        SELECT payload
        FROM pgflow.runs
        WHERE flow_slug = '01_run_flow' LIMIT 1
    ),
    '{"input": "hello world"}'::jsonb,
    'run should have correct payload'::text
);

SELECT is(
    (
        SELECT count(*)
        FROM pgflow.step_states
        WHERE flow_slug = '01_run_flow' AND status = 'pending'
    ),
    1::bigint,
    'should have 1 step_state'
);

SELECT results_eq(
    $$
    SELECT step_slug::text
    FROM pgflow.step_states
    WHERE flow_slug = '01_run_flow'
    $$,
    $$ VALUES ('root') $$,
    'should create step_state for root step'
);

SELECT finish();
ROLLBACK;

BEGIN;
SELECT plan(4);

---- precleanup phase
DELETE FROM pgflow.step_states WHERE workflow_slug = '01_run_workflow';
DELETE FROM pgflow.runs WHERE workflow_slug = '01_run_workflow';
DELETE FROM pgflow.deps WHERE workflow_slug = '01_run_workflow';
DELETE FROM pgflow.steps WHERE workflow_slug = '01_run_workflow';
DELETE FROM pgflow.workflows WHERE slug = '01_run_workflow';

---- init phase ----------------
--------------------------------

INSERT INTO pgflow.workflows (slug) VALUES ('01_run_workflow');

INSERT INTO pgflow.steps (workflow_slug, slug) VALUES
('01_run_workflow', 'root'),
('01_run_workflow', 'left'),
('01_run_workflow', 'right'),
('01_run_workflow', 'end');

INSERT INTO pgflow.deps (workflow_slug, dependency_slug, dependant_slug)
VALUES
('01_run_workflow', 'root', 'left'),
('01_run_workflow', 'root', 'right'),
('01_run_workflow', 'left', 'end'),
('01_run_workflow', 'right', 'end');

SELECT pgflow.run_workflow(
    '01_run_workflow',
    '{"input": "hello world"}'::jsonb
);

---- test phase ----------------
--------------------------------
SELECT is(
    (
        SELECT count(*)
        FROM pgflow.runs
        WHERE workflow_slug = '01_run_workflow'
    ),
    1::bigint,
    'should have 1 run'
);

SELECT is(
    (
        SELECT payload
        FROM pgflow.runs
        WHERE workflow_slug = '01_run_workflow' LIMIT 1
    ),
    '{"input": "hello world"}'::jsonb,
    'run should have correct payload'::text
);

SELECT is(
    (
        SELECT count(*)
        FROM pgflow.step_states
        WHERE workflow_slug = '01_run_workflow' AND status = 'pending'
    ),
    1::bigint,
    'should have 1 step_state'
);

SELECT results_eq(
    $$
    SELECT step_slug::text
    FROM pgflow.step_states
    WHERE workflow_slug = '01_run_workflow'
    $$,
    $$ VALUES ('root') $$,
    'should create step_state for root step'
);

SELECT finish();
ROLLBACK;

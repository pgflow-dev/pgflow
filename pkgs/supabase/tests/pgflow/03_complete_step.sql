BEGIN;
SELECT plan(4);

---- precleanup phase
DELETE FROM pgflow.step_states WHERE workflow_slug = '03_complete_step';
DELETE FROM pgflow.runs WHERE workflow_slug = '03_complete_step';
DELETE FROM pgflow.deps WHERE workflow_slug = '03_complete_step';
DELETE FROM pgflow.steps WHERE workflow_slug = '03_complete_step';
DELETE FROM pgflow.workflows WHERE slug = '03_complete_step';

---- init phase ----------------
--------------------------------

-- BEGIN;
INSERT INTO pgflow.workflows (slug) VALUES ('03_complete_step');

INSERT INTO pgflow.steps (workflow_slug, slug) VALUES
('03_complete_step', 'root'),
('03_complete_step', 'left'),
('03_complete_step', 'right'),
('03_complete_step', 'end');

INSERT INTO pgflow.deps (workflow_slug, dependency_slug, dependant_slug)
VALUES
('03_complete_step', 'root', 'left'),
('03_complete_step', 'root', 'right'),
('03_complete_step', 'left', 'end'),
('03_complete_step', 'right', 'end');

-- create initial run, start root step and store run_id
SELECT
    pgflow.complete_step(
        new_run.id,
        'root',
        '{"output": "success"}'::jsonb
    )
FROM (
    SELECT * FROM pgflow.run_workflow(
        '03_complete_step',
        '{"input": "hello world"}'::jsonb
    )
) AS new_run;

---- test phase ----------------
--------------------------------
SELECT is(
    (
        SELECT status
        FROM pgflow.step_states
        WHERE
            workflow_slug = '03_complete_step'
            AND step_slug = 'root'
    ),
    'completed'::text,
    'step_state status should be updated to completed'
);

SELECT is(
    (
        SELECT step_result
        FROM pgflow.step_states
        WHERE
            workflow_slug = '03_complete_step'
            AND step_slug = 'root'
    ),
    '{"output": "success"}'::jsonb,
    'step_state step_result should be updated to the provided JSONB object'
);

SELECT is(
    (
        SELECT status
        FROM pgflow.step_states
        WHERE
            workflow_slug = '03_complete_step'
            AND step_slug = 'left'
    ),
    'pending',
    'left step should have payload of workflow and dependencies'
);

SELECT is(
    (
        SELECT status
        FROM pgflow.step_states
        WHERE
            workflow_slug = '03_complete_step'
            AND step_slug = 'right'
    ),
    'pending',
    'right step should have payload of workflow and dependencies'
);

-- SELECT is(
--     (
--         SELECT payload
--         FROM pgflow.step_states
--         WHERE
--             workflow_slug = '03_complete_step'
--             AND step_slug = 'left'
--     ),
--     '{
--         "__run__": {"input": "hello world"},
--         "__step__": {"slug": "root"},
--         "root": {"output": "success"}
--     }'::jsonb,
--     'left step should have payload of workflow and dependencies'
-- );
--
-- SELECT is(
--     (
--         SELECT payload
--         FROM pgflow.step_states
--         WHERE
--             workflow_slug = '03_complete_step'
--             AND step_slug = 'right'
--     ),
--     '{
--         "__run__": {"input": "hello world"},
--         "__step__": {"slug": "right"},
--         "root": {"output": "success"}
--     }'::jsonb,
--     'right step should have payload of workflow and dependencies'
-- );

SELECT finish();
ROLLBACK;

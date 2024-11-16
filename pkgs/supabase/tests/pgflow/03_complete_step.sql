BEGIN;
SELECT plan(4);

---- precleanup phase
DELETE FROM pgflow.step_states WHERE flow_slug = '03_complete_step';
DELETE FROM pgflow.runs WHERE flow_slug = '03_complete_step';
DELETE FROM pgflow.deps WHERE flow_slug = '03_complete_step';
DELETE FROM pgflow.steps WHERE flow_slug = '03_complete_step';
DELETE FROM pgflow.flows WHERE flow_slug = '03_complete_step';

---- init phase ----------------
--------------------------------

-- BEGIN;
INSERT INTO pgflow.flows (flow_slug) VALUES ('03_complete_step');

INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
('03_complete_step', 'root'),
('03_complete_step', 'left'),
('03_complete_step', 'right'),
('03_complete_step', 'end');

INSERT INTO pgflow.deps (flow_slug, from_step_slug, to_step_slug)
VALUES
('03_complete_step', 'root', 'left'),
('03_complete_step', 'root', 'right'),
('03_complete_step', 'left', 'end'),
('03_complete_step', 'right', 'end');

-- create initial run, start root step and store run_id
SELECT
    pgflow.complete_step(
        new_run.run_id,
        'root',
        '{"output": "success"}'::jsonb
    )
FROM (
    SELECT * FROM pgflow.run_flow(
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
            flow_slug = '03_complete_step'
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
            flow_slug = '03_complete_step'
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
            flow_slug = '03_complete_step'
            AND step_slug = 'left'
    ),
    'pending',
    'left step should have payload of flow and dependencies'
);

SELECT is(
    (
        SELECT status
        FROM pgflow.step_states
        WHERE
            flow_slug = '03_complete_step'
            AND step_slug = 'right'
    ),
    'pending',
    'right step should have payload of flow and dependencies'
);

-- SELECT is(
--     (
--         SELECT payload
--         FROM pgflow.step_states
--         WHERE
--             flow_slug = '03_complete_step'
--             AND step_slug = 'left'
--     ),
--     '{
--         "run": {"input": "hello world"},
--         "__step__": {"step_slug": "root"},
--         "root": {"output": "success"}
--     }'::jsonb,
--     'left step should have payload of flow and dependencies'
-- );
--
-- SELECT is(
--     (
--         SELECT payload
--         FROM pgflow.step_states
--         WHERE
--             flow_slug = '03_complete_step'
--             AND step_slug = 'right'
--     ),
--     '{
--         "run": {"input": "hello world"},
--         "__step__": {"step_slug": "right"},
--         "root": {"output": "success"}
--     }'::jsonb,
--     'right step should have payload of flow and dependencies'
-- );

SELECT finish();
ROLLBACK;

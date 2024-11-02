BEGIN;
SELECT plan(3);

-- Declare test variables
-- DO $$
CREATE TEMP TABLE _test_vars (
    workflow_slug text,
    payload jsonb,
    run_id uuid
);
INSERT INTO _test_vars (workflow_slug, run_id, payload) VALUES (
    '02_start_step',
    gen_random_uuid(),
    '{"input": "hello world"}'::jsonb
);

---- precleanup phase
DELETE FROM pgflow.steps
WHERE workflow_slug = (SELECT workflow_slug FROM _test_vars);
DELETE FROM pgflow.deps
WHERE workflow_slug = (SELECT workflow_slug FROM _test_vars);
DELETE FROM pgflow.workflows
WHERE slug = (SELECT workflow_slug FROM _test_vars);

---- init phase ----------------
--------------------------------
INSERT INTO pgflow.workflows (slug)
SELECT workflow_slug FROM _test_vars;

INSERT INTO pgflow.steps (workflow_slug, slug) VALUES
((SELECT workflow_slug FROM _test_vars), 'root'),
((SELECT workflow_slug FROM _test_vars), 'left'),
((SELECT workflow_slug FROM _test_vars), 'right'),
((SELECT workflow_slug FROM _test_vars), 'end');

INSERT INTO pgflow.deps (workflow_slug, dependency_slug, dependant_slug)
VALUES
((SELECT workflow_slug FROM _test_vars), 'root', 'left'),
((SELECT workflow_slug FROM _test_vars), 'root', 'right'),
((SELECT workflow_slug FROM _test_vars), 'left', 'end'),
((SELECT workflow_slug FROM _test_vars), 'right', 'end');

-- create initial run and start root step
WITH new_run AS (
    INSERT INTO pgflow.runs (workflow_slug, id, payload, status)
    SELECT
        _tv.workflow_slug,
        _tv.run_id,
        _tv.payload,
        'pending' AS status
    FROM _test_vars AS _tv
    RETURNING *
)
-- SELECT id FROM pgflow.run_workflow(
--     '02_start_step',
--     '{"input": "hello world"}'::jsonb
-- )

SELECT pgflow.start_step(id, 'root'::text) FROM new_run;

---- test phase ----------------
--------------------------------
SELECT is(
    (
        SELECT status
        FROM pgflow.step_states
        WHERE
            workflow_slug = (SELECT _tv.workflow_slug FROM _test_vars AS _tv)
            AND step_slug = 'root'
    ),
    'pending'::text,
    'step_state status should be updated to pending'
);

SELECT is(
    (
        SELECT status
        FROM pgflow.runs
        WHERE workflow_slug = (SELECT _tv.workflow_slug FROM _test_vars AS _tv)
    ),
    'pending'::text,
    'run status should be updated to pending'
);

---- test job queueing -----------
----------------------------------
PREPARE actual_queue AS
SELECT
    entrypoint::text,
    convert_from(payload, 'UTF8')::jsonb as payload_jsonb
FROM public.pgqueuer
WHERE entrypoint = (SELECT _tv.workflow_slug FROM _test_vars AS _tv) || '/root';

PREPARE expected_values AS
SELECT
    (_tv.workflow_slug || '/root')::text as entrypoint,
    jsonb_build_object(
        '__run__', to_jsonb(r.*),
        '__step__', jsonb_build_object('slug', 'root')
    ) as payload_jsonb
FROM _test_vars _tv
JOIN pgflow.runs r ON r.id = _tv.run_id;

SELECT results_eq(
    'actual_queue',
    'expected_values',
    'pgqueuer should contain entry for workflow with correct payload'
);

-- TODO: should not allow starting steps other than 'pending'

SELECT finish();
ROLLBACK;

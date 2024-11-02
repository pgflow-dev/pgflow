BEGIN;
SELECT plan(4);

---- precleanup phase
DELETE FROM pgflow.step_states WHERE workflow_slug = '04_get_dependants';
DELETE FROM pgflow.runs WHERE workflow_slug = '04_get_dependants';
DELETE FROM pgflow.deps WHERE workflow_slug = '04_get_dependants';
DELETE FROM pgflow.steps WHERE workflow_slug = '04_get_dependants';
DELETE FROM pgflow.workflows WHERE slug = '04_get_dependants';

---- init phase ----------------
--------------------------------

INSERT INTO pgflow.workflows (slug) VALUES ('04_get_dependants');

-- Create a workflow with the following structure:
--     A       B   F    
--            / \ /     
--           E   C  
--                \ 
--                 D
INSERT INTO pgflow.steps (workflow_slug, slug) VALUES
('04_get_dependants', 'A'),  -- independent step
('04_get_dependants', 'B'),  -- our target step
('04_get_dependants', 'C'),  -- depends on B and F
('04_get_dependants', 'D'),  -- depends on C
('04_get_dependants', 'E'),  -- depends on B
('04_get_dependants', 'F');  -- dependency for C

INSERT INTO pgflow.deps (workflow_slug, dependency_slug, dependant_slug)
VALUES
('04_get_dependants', 'B', 'C'),
('04_get_dependants', 'B', 'E'),
('04_get_dependants', 'F', 'C'),
('04_get_dependants', 'C', 'D');

-- Create a run and complete some steps
WITH new_run AS (
    SELECT * FROM pgflow.run_workflow('04_get_dependants', '{}'::jsonb)
)
-- Complete B and F (making C ready), and A (which is independent)
SELECT pgflow.complete_step(new_run.id, 'B', '{}'::jsonb),
       pgflow.complete_step(new_run.id, 'F', '{}'::jsonb),
       pgflow.complete_step(new_run.id, 'A', '{}'::jsonb)
FROM new_run;

---- test phase ----------------
--------------------------------

-- Test that independent completed step A is not included
SELECT is(
    (
        SELECT COUNT(*)::int
        FROM pgflow.get_ready_dependants_of(
            (SELECT id FROM pgflow.runs WHERE workflow_slug = '04_get_dependants' LIMIT 1),
            'B'::text
        ) d
        WHERE d.step_slug = 'A'
    ),
    0,
    'Independent step A should not be included in dependants of B'
);

-- Test that E is included (depends only on completed B)
SELECT is(
    (
        SELECT COUNT(*)::int
        FROM pgflow.get_ready_dependants_of(
            (SELECT id FROM pgflow.runs WHERE workflow_slug = '04_get_dependants' LIMIT 1),
            'B'::text
        ) d
        WHERE d.step_slug = 'E'
    ),
    1,
    'Step E should be included as all its dependencies (B) are completed'
);

-- Test that D is not included (depends on incomplete C)
SELECT is(
    (
        SELECT COUNT(*)::int
        FROM pgflow.get_ready_dependants_of(
            (SELECT id FROM pgflow.runs WHERE workflow_slug = '04_get_dependants' LIMIT 1),
            'C'::text
        ) d
        WHERE d.step_slug = 'D'
    ),
    0,
    'Step D should not be included as its dependency C is not completed'
);

-- Test that G is not included when H has no step_state record
-- First add new steps G and H where G depends on H
INSERT INTO pgflow.steps (workflow_slug, slug) VALUES
('04_get_dependants', 'G'),
('04_get_dependants', 'H');

INSERT INTO pgflow.deps (workflow_slug, dependency_slug, dependant_slug)
VALUES ('04_get_dependants', 'H', 'G');

SELECT is(
    (
        SELECT COUNT(*)::int
        FROM pgflow.get_ready_dependants_of(
            (SELECT id FROM pgflow.runs WHERE workflow_slug = '04_get_dependants' LIMIT 1),
            'H'::text
        ) d
        WHERE d.step_slug = 'G'
    ),
    0,
    'Step G should not be included as its dependency H has no step_state record (not started)'
);

SELECT finish();
ROLLBACK;

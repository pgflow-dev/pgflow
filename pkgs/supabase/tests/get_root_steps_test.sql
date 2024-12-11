BEGIN;
SELECT plan(9);

-- Test 1: Basic root step detection
INSERT INTO pgflow.flows (flow_slug) VALUES ('flow1');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
('flow1', 'step1'),
('flow1', 'step2'),
('flow1', 'step3');

INSERT INTO pgflow.deps (flow_slug, from_step_slug, to_step_slug) VALUES
('flow1', 'step1', 'step3');

WITH root_steps AS (
    SELECT step_slug FROM pgflow.get_root_steps('flow1')
)

SELECT is(
    array_agg(step_slug ORDER BY step_slug),
    ARRAY['step1', 'step2'],
    'Should identify root steps correctly'
) FROM root_steps;

-- Test 2: Flow with only root steps
INSERT INTO pgflow.flows (flow_slug) VALUES ('flow2');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
('flow2', 'root1'),
('flow2', 'root2');

SELECT is(
    (SELECT count(*) FROM pgflow.get_root_steps('flow2')),
    2::bigint,
    'Should return all steps when no deps'
);

-- Test 3: Flow with no root steps
INSERT INTO pgflow.flows (flow_slug) VALUES ('flow3');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
('flow3', 'dep1'),
('flow3', 'dep2');

INSERT INTO pgflow.deps (flow_slug, from_step_slug, to_step_slug) VALUES
('flow3', 'dep1', 'dep2'),
('flow3', 'dep2', 'dep1');

SELECT is(
    (SELECT count(*) FROM pgflow.get_root_steps('flow3')),
    0::bigint,
    'Should return empty when no root steps'
);

-- Test 4: Empty flow
INSERT INTO pgflow.flows (flow_slug) VALUES ('empty_flow');

SELECT is(
    (SELECT count(*) FROM pgflow.get_root_steps('empty_flow')),
    0::bigint,
    'Should return empty for flow with no steps'
);

-- Test 5: Non-existent flow
SELECT is(
    (SELECT count(*) FROM pgflow.get_root_steps('nonexistent')),
    0::bigint,
    'Should return empty for nonexistent flow'
);

-- Test 6: Complex dependency chain
INSERT INTO pgflow.flows (flow_slug) VALUES ('complex');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
('complex', 'a'),
('complex', 'b'),
('complex', 'c'),
('complex', 'd');

INSERT INTO pgflow.deps (flow_slug, from_step_slug, to_step_slug) VALUES
('complex', 'b', 'c'),
('complex', 'c', 'd');

WITH root_steps AS (
    SELECT step_slug FROM pgflow.get_root_steps('complex')
)

SELECT is(
    array_agg(step_slug ORDER BY step_slug),
    ARRAY['a', 'b'],
    'Complex deps should identify correct root steps'
) FROM root_steps;

-- Test 7: Multiple flows
INSERT INTO pgflow.flows (flow_slug) VALUES ('test_a'), ('test_b');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
('test_a', 'step1'),
('test_b', 'step1');

SELECT is(
    (SELECT count(*) FROM pgflow.get_root_steps('test_a')),
    1::bigint,
    'Should return roots only for specified flow'
);

SELECT is(
    (SELECT array_agg(flow_slug) FROM pgflow.get_root_steps('test_a')),
    ARRAY['test_a'],
    'Should return correct flow_slug'
);

SELECT is(
    (SELECT array_agg(step_slug) FROM pgflow.get_root_steps('test_a')),
    ARRAY['step1'],
    'Should return correct step_slug'
);

SELECT finish();
ROLLBACK;

BEGIN;

SELECT pgflow.create_flow('temp');
SELECT pgflow.add_step('temp', 'root_a');
SELECT pgflow.add_step('temp', 'root_b');
SELECT pgflow.add_step('temp', 'last', ARRAY['root_a', 'root_b']);

SELECT * FROM pgflow.start_flow('temp', '"hello"'::jsonb);

SELECT * FROM pgflow.step_states;
SELECT * FROM pgflow.step_tasks;
SELECT * FROM pgmq.q_temp;

ROLLBACK;

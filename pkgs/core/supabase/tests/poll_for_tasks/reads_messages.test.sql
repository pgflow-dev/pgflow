begin;
select plan(1);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Prepare the actual query
PREPARE actual AS
SELECT flow_slug, run_id, step_slug, input, msg_id
FROM pgflow.poll_for_tasks (
queue_name => 'sequential',
vt => 1,
qty => 1
)
LIMIT 1 ;

-- Prepare the expected result
PREPARE expected AS
SELECT 'sequential'::text AS flow_slug,
(SELECT run_id FROM pgflow.runs WHERE flow_slug = 'sequential' LIMIT 1) AS run_id,
'first'::text AS step_slug,
jsonb_build_object ('run', 'hello')::jsonb AS input,
(SELECT message_id FROM pgflow.step_tasks 
 WHERE flow_slug = 'sequential' 
 AND step_slug = 'first' 
 LIMIT 1) AS msg_id;

-- Compare the results
SELECT results_eq (
'actual',
'expected',
'poll_for_tasks() returns the expected worker task'
);

SELECT finish () ;
ROLLBACK;

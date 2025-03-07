BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

SELECT is(
    (
      SELECT array_agg(step_slug ORDER BY step_slug)
      FROM pgflow.step_tasks 
      WHERE flow_slug = 'sequential' 
    ),
    ARRAY['first']::text[],
    'A step_task record should be created only for the root step'
);

SELECT is(
    (SELECT q.message
     FROM pgflow.step_tasks AS st
     JOIN pgmq.q_sequential AS q 
       ON st.message_id = q.msg_id
     WHERE st.flow_slug = 'sequential' 
       AND st.step_slug = 'first'),
    jsonb_build_object(
        'flow_slug', 'sequential',
        'run_id', (
          SELECT run_id 
          FROM pgflow.step_tasks 
          WHERE flow_slug = 'sequential' 
            AND step_slug = 'first'
        ),
        'step_slug', 'first'
    ),
    'The message in the queue should contain the correct flow_slug, run_id, and step_slug'
);

SELECT finish();
ROLLBACK;

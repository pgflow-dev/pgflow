-- drop function if exists pgflow.start_flow;
create or replace function pgflow.start_flow(
    flow_slug TEXT,
    payload JSONB
)
returns setof pgflow.runs
language sql
set search_path to ''
volatile
as $$

WITH
  created_run AS (
    INSERT INTO pgflow.runs (flow_slug, payload)
    VALUES (start_flow.flow_slug, start_flow.payload)
    RETURNING *
  ),
  flow_steps AS (
    SELECT flow_slug, step_slug
    FROM pgflow.steps
    WHERE flow_slug = start_flow.flow_slug
  ),
  root_steps AS (
    SELECT s.flow_slug, s.step_slug
    FROM flow_steps AS s
    LEFT JOIN pgflow.deps AS d ON
      s.flow_slug = d.flow_slug AND
      s.step_slug = d.step_slug
    WHERE s.flow_slug = start_flow.flow_slug
      AND d.step_slug IS NULL
  ),
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, status)
    SELECT
      start_flow.flow_slug,
      (SELECT run_id FROM created_run),
      fs.step_slug,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM root_steps rs
          WHERE rs.step_slug = fs.step_slug
        ) THEN 'started'
        ELSE 'created'
      END AS status
    FROM flow_steps fs
    RETURNING *
  ),
  sent_messages AS (
    SELECT
      flow_slug, run_id, step_slug,
      pgmq.send(flow_slug, jsonb_build_object(
        'flow_slug', flow_slug,
        'run_id', run_id,
        'step_slug', step_slug
      )) AS msg_id
    FROM created_step_states
    WHERE status = 'started'
    ORDER BY step_slug
  ),
  created_step_tasks AS (
    INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, message_id)
    SELECT
      flow_slug, run_id, step_slug, msg_id
    FROM sent_messages
  )

SELECT * FROM created_run;

$$;

CREATE OR REPLACE FUNCTION pgflow.create_flow(
    flow_slug text
)
RETURNS pgflow.flows
LANGUAGE sql
SET search_path TO ''
VOLATILE
AS $$

WITH
  -- Insert or get existing flow
  flow_upsert AS (
    INSERT INTO pgflow.flows (flow_slug)
    VALUES (flow_slug)
    ON CONFLICT (flow_slug) DO UPDATE
    SET flow_slug = pgflow.flows.flow_slug
    RETURNING *
  ),
  -- Create queue if needed
  ensure_queue AS (
    SELECT pgmq.create(flow_slug) 
    WHERE NOT EXISTS (
      SELECT 1 FROM pgmq.list_queues() WHERE queue_name = flow_slug
    )
  )
  -- Return the flow, with a dummy reference to ensure_queue to force evaluation
  SELECT f.* 
  FROM flow_upsert f, (SELECT 1 FROM ensure_queue) _dummy;
$$;

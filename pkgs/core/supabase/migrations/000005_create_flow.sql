create or replace function pgflow.create_flow(
  flow_slug text,
  max_attempts int default 3,
  base_delay int default 5,
  timeout int default 60
)
returns pgflow.flows
language sql
set search_path to ''
volatile
as $$
WITH
  flow_upsert AS (
    INSERT INTO pgflow.flows (flow_slug, opt_max_attempts, opt_base_delay, opt_timeout)
    VALUES (flow_slug, max_attempts, base_delay, timeout)
    ON CONFLICT (flow_slug) DO UPDATE
    SET flow_slug = pgflow.flows.flow_slug -- Dummy update
    RETURNING *
  ),
  ensure_queue AS (
    SELECT pgmq.create(flow_slug)
    WHERE NOT EXISTS (
      SELECT 1 FROM pgmq.list_queues() WHERE queue_name = flow_slug
    )
  )
SELECT f.*
FROM flow_upsert f
LEFT JOIN (SELECT 1 FROM ensure_queue) _dummy ON true; -- Left join ensures flow is returned
$$;


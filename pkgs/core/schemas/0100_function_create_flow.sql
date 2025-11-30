-- Create a new flow with optional configuration.
-- NULL parameters use defaults defined in the 'defaults' CTE below.
-- This allows callers to pass NULL to explicitly use the default value.
create or replace function pgflow.create_flow(
  flow_slug text,
  max_attempts int default null,
  base_delay int default null,
  timeout int default null
)
returns pgflow.flows
language sql
set search_path to ''
volatile
as $$
WITH
  defaults AS (
    SELECT 3 AS def_max_attempts, 5 AS def_base_delay, 60 AS def_timeout
  ),
  flow_upsert AS (
    INSERT INTO pgflow.flows (flow_slug, opt_max_attempts, opt_base_delay, opt_timeout)
    SELECT
      flow_slug,
      COALESCE(max_attempts, defaults.def_max_attempts),
      COALESCE(base_delay, defaults.def_base_delay),
      COALESCE(timeout, defaults.def_timeout)
    FROM defaults
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

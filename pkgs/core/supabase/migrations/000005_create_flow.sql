CREATE OR REPLACE FUNCTION pgflow.create_flow(
    flow_slug text
)
RETURNS pgflow.flows
LANGUAGE sql
SET search_path TO ''
VOLATILE
AS $$
    INSERT INTO pgflow.flows (flow_slug)
    VALUES (flow_slug)
    ON CONFLICT (flow_slug) DO NOTHING
    RETURNING *;
$$;

create extension if not exists pgmq version '1.4.4';

CREATE SCHEMA IF NOT EXISTS pgflow;
SET search_path TO pgflow;

--------------------------------------------------------------------------
------------------ TODO: fix me, UNSECURE --------------------------------
--------------------------------------------------------------------------
GRANT USAGE ON SCHEMA pgflow TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA pgflow TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA pgflow TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgflow TO anon,
authenticated,
service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgflow
GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgflow
GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgflow
GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

SELECT pgmq.create('pgflow');

------------------------------------------
-- Core flow definition tables
------------------------------------------

----- check constraint helper function -------
CREATE OR REPLACE FUNCTION pgflow.is_valid_slug(
    slug text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
begin
    return
      slug is not null
      and slug <> ''
      and length(slug) <= 128
      and slug ~ '^[a-zA-Z_][a-zA-Z0-9_]*$';
end;
$$;

-- Flows table - stores flow definitions
CREATE TABLE pgflow.flows (
    flow_slug text PRIMARY KEY NOT NULL  -- Unique identifier for the flow
    CHECK (is_valid_slug(flow_slug))
);

-- Steps table - stores individual steps within flows
CREATE TABLE pgflow.steps (
    flow_slug text NOT NULL REFERENCES flows (flow_slug),
    step_slug text NOT NULL,
    PRIMARY KEY (flow_slug, step_slug),
    CHECK (is_valid_slug(flow_slug)),
    CHECK (is_valid_slug(step_slug))
);

-- Dependencies table - stores relationships between steps
CREATE TABLE pgflow.deps (
    flow_slug text NOT NULL REFERENCES pgflow.flows (flow_slug),
    dep_step_slug text NOT NULL,  -- The step that must complete first
    step_slug text NOT NULL,   -- The step that depends on dep_step_slug
    PRIMARY KEY (flow_slug, dep_step_slug, step_slug),
    FOREIGN KEY (flow_slug, dep_step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    FOREIGN KEY (flow_slug, step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    CHECK (dep_step_slug != step_slug),  -- Prevent self-dependencies
    CHECK (is_valid_slug(dep_step_slug)),
    CHECK (is_valid_slug(step_slug))
);

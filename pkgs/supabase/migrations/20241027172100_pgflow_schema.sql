-- Create flow management schema
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

------------------------------------------
-- Core flow definition tables
------------------------------------------

-- Flows table - stores flow definitions
CREATE TABLE pgflow.flows (
    flow_slug TEXT PRIMARY KEY NOT NULL  -- Unique identifier for the flow
);

-- Steps table - stores individual steps within flows
CREATE TABLE pgflow.steps (
    flow_slug TEXT NOT NULL REFERENCES flows (flow_slug),
    step_slug TEXT NOT NULL,
    PRIMARY KEY (flow_slug, step_slug)
);

-- Dependencies table - stores relationships between steps
CREATE TABLE pgflow.deps (
    flow_slug TEXT NOT NULL REFERENCES pgflow.flows (flow_slug),
    from_step_slug TEXT NOT NULL,  -- The step that must complete first
    to_step_slug TEXT NOT NULL,   -- The step that depends on from_step_slug
    PRIMARY KEY (flow_slug, from_step_slug, to_step_slug),
    FOREIGN KEY (flow_slug, from_step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    FOREIGN KEY (flow_slug, to_step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    CHECK (from_step_slug != to_step_slug)  -- Prevent self-dependencies
);

------------------------------------------
-- Runtime State Tables
------------------------------------------

-- Runs table - tracks flow execution instances
CREATE TABLE pgflow.runs (
    flow_slug TEXT NOT NULL REFERENCES pgflow.flows (flow_slug),
    run_id UUID PRIMARY KEY NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload JSONB NOT NULL,
    CHECK (status IN ('pending', 'failed', 'completed'))
);

-- Step states table - tracks the state of individual steps within a run
CREATE TABLE pgflow.step_states (
    flow_slug TEXT NOT NULL REFERENCES pgflow.flows (flow_slug),
    run_id UUID NOT NULL REFERENCES pgflow.runs (run_id),
    step_slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    step_result JSONB,
    PRIMARY KEY (run_id, step_slug),
    FOREIGN KEY (flow_slug, step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    CHECK (status IN ('pending', 'failed', 'completed'))
);

--- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE pgflow.step_states;

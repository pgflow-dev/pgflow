-- Create workflow management schema
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
-- Core workflow definition tables
------------------------------------------

-- Workflows table - stores workflow definitions
CREATE TABLE pgflow.workflows (
    slug TEXT PRIMARY KEY NOT NULL  -- Unique identifier for the workflow
);

-- Steps table - stores individual steps within workflows
CREATE TABLE pgflow.steps (
    workflow_slug TEXT NOT NULL REFERENCES workflows (slug),
    slug TEXT NOT NULL,
    PRIMARY KEY (workflow_slug, slug)
);

-- Dependencies table - stores relationships between steps
CREATE TABLE pgflow.deps (
    workflow_slug TEXT NOT NULL REFERENCES pgflow.workflows (slug),
    dependency_slug TEXT NOT NULL,  -- The step that must complete first
    dependant_slug TEXT NOT NULL,   -- The step that depends on dependency_slug
    PRIMARY KEY (workflow_slug, dependency_slug, dependant_slug),
    FOREIGN KEY (workflow_slug, dependency_slug)
    REFERENCES pgflow.steps (workflow_slug, slug),
    FOREIGN KEY (workflow_slug, dependant_slug)
    REFERENCES pgflow.steps (workflow_slug, slug),
    CHECK (dependency_slug != dependant_slug)  -- Prevent self-dependencies
);

------------------------------------------
-- Runtime State Tables
------------------------------------------

-- Runs table - tracks workflow execution instances
CREATE TABLE pgflow.runs (
    workflow_slug TEXT NOT NULL REFERENCES pgflow.workflows (slug),
    id UUID PRIMARY KEY NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload JSONB NOT NULL,
    CHECK (status IN ('pending', 'failed', 'completed'))
);

-- Step states table - tracks the state of individual steps within a run
CREATE TABLE pgflow.step_states (
    workflow_slug TEXT NOT NULL REFERENCES pgflow.workflows (slug),
    run_id UUID NOT NULL REFERENCES pgflow.runs (id),
    step_slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    step_result JSONB,
    PRIMARY KEY (run_id, step_slug),
    FOREIGN KEY (workflow_slug, step_slug)
    REFERENCES pgflow.steps (workflow_slug, slug),
    CHECK (status IN ('pending', 'failed', 'completed'))
);

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
    from_step_slug text NOT NULL,  -- The step that must complete first
    to_step_slug text NOT NULL,   -- The step that depends on from_step_slug
    PRIMARY KEY (flow_slug, from_step_slug, to_step_slug),
    FOREIGN KEY (flow_slug, from_step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    FOREIGN KEY (flow_slug, to_step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    CHECK (from_step_slug != to_step_slug),  -- Prevent self-dependencies
    CHECK (is_valid_slug(from_step_slug)),
    CHECK (is_valid_slug(to_step_slug))
);

------------------------------------------
-- Runtime State Tables
------------------------------------------

-- Runs table - tracks flow execution instances
CREATE TABLE pgflow.runs (
    flow_slug text NOT NULL REFERENCES pgflow.flows (flow_slug),
    run_id uuid PRIMARY KEY NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    payload jsonb NOT NULL,
    CHECK (status IN ('pending', 'failed', 'completed')),
    CHECK (is_valid_slug(flow_slug))
);

-- Step states table - tracks the state of individual steps within a run
CREATE TABLE pgflow.step_states (
    flow_slug text NOT NULL REFERENCES pgflow.flows (flow_slug),
    run_id uuid NOT NULL REFERENCES pgflow.runs (run_id),
    step_slug text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    failed_at timestamptz,
    completed_at timestamptz,
    status text NOT NULL GENERATED ALWAYS AS (
        CASE
            WHEN failed_at IS NOT NULL THEN 'failed'
            WHEN completed_at IS NOT NULL THEN 'completed'
            ELSE 'pending'
        END
    ) STORED,
    step_result jsonb,
    PRIMARY KEY (run_id, step_slug),
    FOREIGN KEY (flow_slug, step_slug)
    REFERENCES pgflow.steps (flow_slug, step_slug),
    CHECK (NOT (completed_at IS NOT NULL AND failed_at IS NOT NULL)),
    CHECK (status IN ('pending', 'failed', 'completed')),
    CHECK (is_valid_slug(flow_slug)),
    CHECK (is_valid_slug(step_slug))
);
ALTER PUBLICATION supabase_realtime ADD TABLE pgflow.step_states;

-- Executio logs table - tracks the task of individual steps
CREATE TABLE pgflow.step_tasks (
    flow_slug text NOT NULL REFERENCES pgflow.flows (flow_slug),
    step_slug text NOT NULL,
    run_id uuid NOT NULL REFERENCES pgflow.runs (run_id),
    status text NOT NULL DEFAULT 'queued',
    payload jsonb NOT NULL,
    result jsonb,
    attempt_count int NOT NULL DEFAULT 1,
    max_attempts int NOT NULL DEFAULT 3,
    last_attempt_at timestamptz,
    next_attempt_at timestamptz,
    CONSTRAINT step_tasks_pkey PRIMARY KEY (run_id, step_slug),
    FOREIGN KEY (run_id, step_slug)
    REFERENCES pgflow.step_states (run_id, step_slug),
    CHECK (status IN ('queued', 'started', 'failed', 'completed')),
    CHECK (is_valid_slug(flow_slug)),
    CHECK (is_valid_slug(step_slug))
);
ALTER PUBLICATION supabase_realtime ADD TABLE pgflow.step_tasks;

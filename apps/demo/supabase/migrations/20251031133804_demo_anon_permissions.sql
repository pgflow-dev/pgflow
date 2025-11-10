-- Grant anon role access to start flows
GRANT USAGE ON SCHEMA pgflow TO anon;
GRANT EXECUTE ON FUNCTION pgflow.start_flow TO anon;

-- Grant anon role read access to pgflow tables for real-time updates
GRANT SELECT ON pgflow.flows TO anon;
GRANT SELECT ON pgflow.runs TO anon;
GRANT SELECT ON pgflow.steps TO anon;
GRANT SELECT ON pgflow.step_states TO anon;
GRANT SELECT ON pgflow.step_tasks TO anon;
GRANT SELECT ON pgflow.deps TO anon;
GRANT SELECT ON pgflow.workers TO anon;

-- Enable real-time for anon role
ALTER PUBLICATION supabase_realtime ADD TABLE pgflow.runs;
ALTER PUBLICATION supabase_realtime ADD TABLE pgflow.step_states;

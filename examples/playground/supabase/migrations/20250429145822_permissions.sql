-- Configure permissions to allow authenticated users to access pgflow tables and functions

-- Enable RLS for pgflow tables
alter table pgflow.flows enable row level security;
alter table pgflow.steps enable row level security;
alter table pgflow.deps enable row level security;
alter table pgflow.runs enable row level security;
alter table pgflow.step_states enable row level security;
alter table pgflow.step_tasks enable row level security;
alter table pgflow.workers enable row level security;

-- Create RLS policies for authenticated users to view pgflow tables
create policy flows_select_policy on pgflow.flows
for select to authenticated using (true);

create policy steps_select_policy on pgflow.steps
for select to authenticated using (true);

create policy deps_select_policy on pgflow.deps
for select to authenticated using (true);

create policy runs_select_policy on pgflow.runs
for select to authenticated using (true);

create policy step_states_select_policy on pgflow.step_states
for select to authenticated using (true);

create policy step_tasks_select_policy on pgflow.step_tasks
for select to authenticated using (true);

create policy workers_select_policy on pgflow.workers
for select to authenticated using (true);

-- Grant select permissions on pgflow tables to authenticated users
grant select on pgflow.flows to authenticated;
grant select on pgflow.steps to authenticated;
grant select on pgflow.deps to authenticated;
grant select on pgflow.runs to authenticated;
grant select on pgflow.step_states to authenticated;
grant select on pgflow.step_tasks to authenticated;
grant select on pgflow.workers to authenticated;

-- Create a secure wrapper function for pgflow.start_flow
-- This is a security definer function that will run with the privileges of the creator
-- rather than the caller, allowing it to call pgflow.start_flow even if direct access is blocked
create or replace function public.start_analyze_website_flow(url text)
returns json
language plpgsql
security definer -- Run as the function creator (superuser)
set search_path = public, pgflow -- Restrict search path for security
as $$
DECLARE
  result_run RECORD;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to start a flow';
  END IF;

  -- Call pgflow.start_flow as the function owner and get the complete run record
  SELECT * INTO result_run FROM pgflow.start_flow('analyze_website', jsonb_build_object('url', url));

  -- Return the complete run record to the caller
  RETURN row_to_json(result_run);
END;
$$;

-- Grant execute permission on the wrapper function to authenticated users
grant execute on function public.start_analyze_website_flow(text) to authenticated;

-- REVOKE direct RPC access to pgflow.start_flow from authenticated users
-- This ensures that users can only call the flow through our secure wrapper
revoke execute on function pgflow.start_flow(text, jsonb) from authenticated;

-- Set up realtime subscriptions for pgflow tables
alter publication supabase_realtime add table pgflow.flows;
alter publication supabase_realtime add table pgflow.steps;
alter publication supabase_realtime add table pgflow.deps;
alter publication supabase_realtime add table pgflow.runs;
alter publication supabase_realtime add table pgflow.step_states;
alter publication supabase_realtime add table pgflow.step_tasks;
alter publication supabase_realtime add table pgflow.workers;

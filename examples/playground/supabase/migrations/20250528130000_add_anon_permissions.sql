-- Add permissions for anon role to support PgflowClient realtime subscriptions
-- This is needed when users access flows before authentication

-- Grant usage on the pgflow schema to anon users
grant usage on schema pgflow to anon;

-- Grant select permissions on pgflow tables to anon users (for realtime subscriptions)
grant select on pgflow.flows to anon;
grant select on pgflow.steps to anon;
grant select on pgflow.deps to anon;
grant select on pgflow.runs to anon;
grant select on pgflow.step_states to anon;
grant select on pgflow.step_tasks to anon;
grant select on pgflow.workers to anon;

-- Grant execute permissions on pgflow functions needed by PgflowClient
grant execute on function pgflow.start_flow_with_states(text, jsonb, uuid) to anon;
grant execute on function pgflow.get_run_with_states(uuid) to anon;

-- Create RLS policies for anon users (they can only see their own runs)
create policy flows_anon_select_policy on pgflow.flows
for select to anon using (true);

create policy steps_anon_select_policy on pgflow.steps  
for select to anon using (true);

create policy deps_anon_select_policy on pgflow.deps
for select to anon using (true);

create policy runs_anon_select_policy on pgflow.runs
for select to anon using (true);

create policy step_states_anon_select_policy on pgflow.step_states
for select to anon using (true);

create policy step_tasks_anon_select_policy on pgflow.step_tasks
for select to anon using (true);

create policy workers_anon_select_policy on pgflow.workers
for select to anon using (true);

-- Note: The anon role has limited access and should only be used for demo purposes
-- In production, users should be authenticated before accessing flows
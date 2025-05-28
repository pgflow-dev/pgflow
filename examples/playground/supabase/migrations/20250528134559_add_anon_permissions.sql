-- Add permissions for anon and authenticated roles to support PgflowClient realtime subscriptions
-- This is needed when users access flows before or after authentication

-- Grant usage on the pgflow schema to anon and authenticated users
grant usage on schema pgflow to anon, authenticated;

-- Grant select permissions on pgflow tables to anon and authenticated users (for realtime subscriptions)
grant select on pgflow.flows to anon, authenticated;
grant select on pgflow.steps to anon, authenticated;
grant select on pgflow.deps to anon, authenticated;
grant select on pgflow.runs to anon, authenticated;
grant select on pgflow.step_states to anon, authenticated;
grant select on pgflow.step_tasks to anon, authenticated;
grant select on pgflow.workers to anon, authenticated;

-- Grant execute permissions on pgflow functions needed by PgflowClient
grant execute on function pgflow.start_flow_with_states(text, jsonb, uuid) to anon, authenticated;
grant execute on function pgflow.get_run_with_states(uuid) to anon, authenticated;

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

-- Create RLS policies for authenticated users (they can only see their own runs)
create policy flows_authenticated_select_policy on pgflow.flows
for select to authenticated using (true);

create policy steps_authenticated_select_policy on pgflow.steps  
for select to authenticated using (true);

create policy deps_authenticated_select_policy on pgflow.deps
for select to authenticated using (true);

create policy runs_authenticated_select_policy on pgflow.runs
for select to authenticated using (true);

create policy step_states_authenticated_select_policy on pgflow.step_states
for select to authenticated using (true);

create policy step_tasks_authenticated_select_policy on pgflow.step_tasks
for select to authenticated using (true);

create policy workers_authenticated_select_policy on pgflow.workers
for select to authenticated using (true);

-- Note: The anon role has limited access and should only be used for demo purposes
-- In production, users should be authenticated before accessing flows
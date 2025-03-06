create schema if not exists pgflow_tests;

create or replace function pgflow_tests.reset_db() returns void as $$
  DELETE FROM pgflow.step_states;
  DELETE FROM pgflow.runs;
  DELETE FROM pgflow.deps;
  DELETE FROM pgflow.steps;
  DELETE FROM pgflow.flows;
$$ language sql;

create or replace function pgflow_tests.setup_flow(
    flow_slug text
) returns void as $$
begin

if flow_slug = 'sequential' then
  PERFORM pgflow.create_flow('sequential');
  PERFORM pgflow.add_step('sequential', 'first');
  PERFORM pgflow.add_step('sequential', 'second', ARRAY['first']);
  PERFORM pgflow.add_step('sequential', 'last', ARRAY['second']);
elsif flow_slug = 'sequential_other' then
  PERFORM pgflow.create_flow('other');
  PERFORM pgflow.add_step('other', 'first');
  PERFORM pgflow.add_step('other', 'second', ARRAY['first']);
  PERFORM pgflow.add_step('other', 'last', ARRAY['second']);
else
  RAISE EXCEPTION 'Unknown test flow: %', flow_slug;
end if;

end;
$$ language plpgsql;

create schema if not exists pgflow_tests;
create or replace function pgflow_tests.reset_db() returns void as $$

  DELETE FROM pgflow.step_states;
  DELETE FROM pgflow.runs;
  DELETE FROM pgflow.deps;
  DELETE FROM pgflow.steps;
  DELETE FROM pgflow.flows;


$$ language sql;

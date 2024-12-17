create schema if not exists pgflow_tests;

create or replace function pgflow_tests.load_flow(flow_slug text)
returns void
language sql
set search_path to pgflow
as $$
    delete from step_tasks ss where ss.flow_slug = flow_slug;
    delete from step_states ss where ss.flow_slug = flow_slug;
    delete from runs r where r.flow_slug = flow_slug;
    delete from deps d where d.flow_slug = flow_slug;
    delete from steps s where s.flow_slug = flow_slug;
    delete from flows f where f.flow_slug = flow_slug;

    -- Step 1: Setup the flow
    INSERT INTO flows (flow_slug) VALUES ('Basic');
    INSERT INTO steps (flow_slug, step_slug) VALUES
    ('Basic', 'root'),
    ('Basic', 'left'),
    ('Basic', 'right'),
    ('Basic', 'end');

    INSERT INTO deps (flow_slug, from_step_slug, to_step_slug) VALUES
    ('Basic', 'root', 'left'),
    ('Basic', 'root', 'right'),
    ('Basic', 'left', 'end'),
    ('Basic', 'right', 'end');
$$;

---------------------------------------
-------- MOCK call_edgefn { -----------
---------------------------------------
create table if not exists pgflow_tests.call_edgefn_calls (
    function_name text,
    body text
);

create or replace function pgflow_tests.mock_call_edgefn()
returns void
language plpgsql
volatile
set search_path to pgflow
as $$
BEGIN
    -- Create the mock function
    CREATE OR REPLACE FUNCTION call_edgefn(
        function_name text, body text
    )
    returns void as $mock_body$
        -- Log the call to the temporary table
        INSERT INTO pgflow_tests.call_edgefn_calls (function_name, body)
        VALUES (function_name, body);
    $mock_body$ language sql;
END;
$$;
---------------------------------------
-------- } MOCK call_edgefn -----------
---------------------------------------

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
-------- MOCK start_step { ------------
---------------------------------------
create table if not exists pgflow_tests.start_step_calls (
    run_id uuid,
    step_slug text
);

-- Mocked version of start_step
create or replace function pgflow_tests.start_step(
    p_run_id uuid,
    p_step_slug text
)
returns table (
    flow_slug text,
    step_slug text,
    run_id uuid,
    status text,
    step_result jsonb
)
language plpgsql
set search_path to pgflow_tests
as $$
BEGIN
    -- Log the call to the temporary table
    INSERT INTO start_step_calls (run_id, step_slug)
    VALUES (p_run_id, p_step_slug);

    -- Return a mock row
    RETURN QUERY
    SELECT
        'test_flow'::TEXT,
        p_step_slug,
        p_run_id::UUID,
        'pending'::TEXT,
        '{}'::JSONB;
END;
$$;

create or replace function pgflow_tests.mock_start_step()
returns void
language plpgsql
set search_path to pgflow
as $$
BEGIN
    -- Create the mock function
    CREATE OR REPLACE FUNCTION start_step(
        p_run_id uuid,
        p_step_slug text
    )
    returns table (
        flow_slug text,
        step_slug text,
        run_id uuid,
        status text,
        step_result jsonb
    )
    language sql
    set search_path to pgflow_tests
    AS $inner_body$
        SELECT * FROM start_step(p_run_id, p_step_slug);
    $inner_body$;
END;
$$;
---------------------------------------
-------- } MOCK start_step ------------
---------------------------------------

---------------------------------------
-------- MOCK call_edgefn { -----------
---------------------------------------
create table if not exists pgflow_tests.call_edgefn_calls (
    function_name text,
    body text
);

create or replace function pgflow_tests.call_edgefn(
    function_name text,
    body text
)
returns void
language plpgsql
set search_path to pgflow_tests
as $$
BEGIN
    -- Log the call to the temporary table
    INSERT INTO call_edgefn_calls (function_name, body)
    VALUES (function_name, body);
END;
$$;

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
    $mock_body$ language sql;
END;
$$;
---------------------------------------
-------- } MOCK call_edgefn -----------
---------------------------------------

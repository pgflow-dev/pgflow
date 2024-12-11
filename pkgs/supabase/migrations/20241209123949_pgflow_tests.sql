create schema if not exists pgflow_tests;
set search_path to pgflow_tests;



create or replace function pgflow_tests.load_flow(flow_slug text)
returns void as $$
    delete from pgflow.step_tasks ss where ss.flow_slug = flow_slug;
    delete from pgflow.step_states ss where ss.flow_slug = flow_slug;
    delete from pgflow.runs r where r.flow_slug = flow_slug;
    delete from pgflow.deps d where d.flow_slug = flow_slug;
    delete from pgflow.steps s where s.flow_slug = flow_slug;
    delete from pgflow.flows f where f.flow_slug = flow_slug;

    -- Step 1: Setup the flow
    INSERT INTO pgflow.flows (flow_slug) VALUES ('BasicFlow');
    INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
    ('BasicFlow', 'root'),
    ('BasicFlow', 'left'),
    ('BasicFlow', 'right'),
    ('BasicFlow', 'end');

    INSERT INTO pgflow.deps (flow_slug, from_step_slug, to_step_slug) VALUES
    ('BasicFlow', 'root', 'left'),
    ('BasicFlow', 'root', 'right'),
    ('BasicFlow', 'left', 'end'),
    ('BasicFlow', 'right', 'end');
$$ language sql;

-- create or replace function pgflow_tests.assert_step_status(
--     run_id uuid,
--     step_slug text,
--     expected_status text
-- )
-- returns text as $$
-- SELECT is(
--     (SELECT status FROM pgflow.step_states AS ss WHERE ss.run_id = run_id AND ss.step_slug = step_slug limit 1),
--     expected_status,
--     'Step ' || step_slug || ' has expected status of ' || expected_status
-- );
-- $$ language sql;
--
-- create or replace function pgflow_tests.assert_step_result(
--     run_id uuid,
--     step_slug text,
--     expected_result jsonb
-- )
-- returns text as $$
-- -- declare
-- --     p_run_id uuid := run_id;
-- --     p_step_slug text := step_slug;
-- --     actual_result jsonb;
-- SELECT is(
--     (SELECT step_result FROM pgflow.step_states AS ss WHERE ss.run_id = run_id AND ss.step_slug = step_slug limit 1),
--     expected_result,
--     'Step ' || step_slug || ' has expected result of ' || expected_result::text
-- );
-- $$ language sql;



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
    run_id uuid,
    status text,
    step_result jsonb
) as $$
BEGIN
    -- Log the call to the temporary table
    INSERT INTO pgflow_tests.start_step_calls (run_id, step_slug)
    VALUES (p_run_id, p_step_slug);

    -- Return a mock row
    RETURN QUERY
    SELECT
        'test_flow'::TEXT,
        p_run_id::UUID,
        'pending'::TEXT,
        '{}'::JSONB;
END;
$$ language plpgsql;

create or replace function pgflow_tests.mock_start_step()
returns void as $$
BEGIN
    -- Create the mock function
    CREATE OR REPLACE FUNCTION pgflow.start_step(
        p_run_id uuid,
        p_step_slug text
    )
    returns table (
        flow_slug text,
        run_id uuid,
        status text,
        step_result jsonb
    ) AS '
        SELECT * FROM pgflow_tests.start_step(p_run_id, p_step_slug);
    ' LANGUAGE SQL;
END;
$$ language plpgsql;
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
returns void as $$
BEGIN
    -- Log the call to the temporary table
    INSERT INTO pgflow_tests.call_edgefn_calls (function_name, body)
    VALUES (function_name, body);
END;
$$ language plpgsql;

create or replace function pgflow_tests.mock_call_edgefn()
returns void as $$
BEGIN
    -- Create the mock function
    CREATE OR REPLACE FUNCTION pgflow.call_edgefn(
        function_name text, body text
    )
    returns void as '' LANGUAGE SQL;
END;
$$ language plpgsql;
---------------------------------------
-------- } MOCK call_edgefn -----------
---------------------------------------

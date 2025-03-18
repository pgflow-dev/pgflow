\x
begin;
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('two_roots_left_right');

--------------------------------------------------------------------------------
--------------------------------------------------------------------------------
--------------------------------------------------------------------------------


select pgflow.start_flow('two_roots_left_right', '"hello"'::jsonb);

select pgflow_tests.poll_and_complete('two_roots_left_right');
select pgflow_tests.poll_and_complete('two_roots_left_right');
select pgflow_tests.poll_and_complete('two_roots_left_right');
select pgflow_tests.poll_and_complete('two_roots_left_right');

select jsonb_pretty(output) from pgflow.runs;
select * from pgflow.runs;

rollback;

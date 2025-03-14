select pgflow_tests.reset_db();
select pgflow_tests.setup_helpers();
select pgflow_tests.setup_flow('sequential');

-- SETUP
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- default retry_limit is 1, so failing twice should mark the task as failed
select poll_and_fail('sequential');
select pg_sleep(2);
select poll_and_fail('sequential');
select * from pgflow.step_tasks;
select * from pgmq.q_sequential;
-- select * from pgflow.step_tasks;
--
select * from pgflow.step_tasks;
select * from pgflow.step_states;
select * from pgflow.runs;

begin;
select * from plan(3);
select pgflow_tests.reset_db();

-- Create a flow with two root steps, each with different opt_timeout values
select pgflow.create_flow('timeout_test', timeout => 60);
select pgflow.add_step('timeout_test', 'step_with_flow_timeout');
select pgflow.add_step('timeout_test', 'step_30', timeout => 30);
select pgflow.add_step('timeout_test', 'step_45', timeout => 45);

-- Start the flow which will create tasks for both root steps
select pgflow.start_flow('timeout_test', '"test_input"'::jsonb);

-- Poll for both tasks (qty=2)
select * from pgflow.poll_for_tasks('timeout_test', vt => 1, qty => 999);

-- Assert that vt_delay is set to opt_timeout + 2 for each step
select pgflow_tests.assert_retry_delay(
  'timeout_test',
  'step_30',
  32, -- 30 + 2
  'step_30 should have vt_delay set to opt_timeout (30) + 2 seconds'
);

select pgflow_tests.assert_retry_delay(
  'timeout_test',
  'step_45',
  47, -- 45 + 2
  'step_45 should have vt_delay set to opt_timeout (45) + 2 seconds'
);

-- Assert that by default it will use flow opt_timeout + 2 if not overridden
select pgflow_tests.assert_retry_delay(
  'timeout_test',
  'step_with_flow_timeout',
  62, -- 60 + 2
  'step_with_flow_timeout should have vt_delay set to flow opt_timeout (60) + 2 seconds'
);

select * from finish();
rollback;

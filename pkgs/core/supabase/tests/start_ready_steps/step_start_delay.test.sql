begin;
select plan(5);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with dependent steps that have start delays
select pgflow.create_flow('ready_delay_flow');
select pgflow.add_step('ready_delay_flow', 'root_step');
select pgflow.add_step('ready_delay_flow', 'dep_no_delay', ARRAY['root_step']);
select pgflow.add_step('ready_delay_flow', 'dep_with_delay', ARRAY['root_step'], start_delay => 900);
select pgflow.add_step('ready_delay_flow', 'dep_long_delay', ARRAY['root_step'], start_delay => 7200);

-- Start the flow
select pgflow.start_flow('ready_delay_flow', '{"test": "ready"}'::jsonb);

-- Get the run_id for testing
create temp table test_run as
  select run_id from pgflow.runs where flow_slug = 'ready_delay_flow' limit 1;

-- Complete the root step to make dependent steps ready
select pgflow.complete_task(
  (select run_id from test_run),
  'root_step',
  0,
  '{"root": "completed"}'::jsonb
);

-- TEST: All dependent steps should now have tasks created
select is(
  (
    select count(*)::int
    from pgflow.step_tasks
    where flow_slug = 'ready_delay_flow'
      and step_slug in ('dep_no_delay', 'dep_with_delay', 'dep_long_delay')
      and run_id = (select run_id from test_run)
  ),
  3,
  'All dependent steps should have tasks created after root completes'
);

-- TEST: Step without delay should be immediately visible
select is(
  (
    select count(*)::int
    from pgmq.q_ready_delay_flow q
    join pgflow.step_tasks st on st.message_id = q.msg_id
    where st.step_slug = 'dep_no_delay'
      and st.run_id = (select run_id from test_run)
      and q.vt <= clock_timestamp()
  ),
  1,
  'Dependent step without delay should be immediately visible'
);

-- TEST: Steps with delay should have future visibility
select is(
  (
    select count(*)::int
    from pgmq.q_ready_delay_flow q
    join pgflow.step_tasks st on st.message_id = q.msg_id
    where st.step_slug in ('dep_with_delay', 'dep_long_delay')
      and st.run_id = (select run_id from test_run)
      and q.vt > clock_timestamp()
  ),
  2,
  'Dependent steps with delay should have future visibility timeout'
);

-- TEST: Verify dep_with_delay has approximately 900 second delay
select ok(
  (
    select abs(extract(epoch from (q.vt - clock_timestamp())) - 900) < 2
    from pgmq.q_ready_delay_flow q
    join pgflow.step_tasks st on st.message_id = q.msg_id
    where st.step_slug = 'dep_with_delay'
      and st.run_id = (select run_id from test_run)
  ),
  'dep_with_delay message should have visibility timeout approximately 900 seconds in the future'
);

-- TEST: Verify dep_long_delay has approximately 7200 second delay
select ok(
  (
    select abs(extract(epoch from (q.vt - clock_timestamp())) - 7200) < 2
    from pgmq.q_ready_delay_flow q
    join pgflow.step_tasks st on st.message_id = q.msg_id
    where st.step_slug = 'dep_long_delay'
      and st.run_id = (select run_id from test_run)
  ),
  'dep_long_delay message should have visibility timeout approximately 7200 seconds in the future'
);

select * from finish();
rollback;
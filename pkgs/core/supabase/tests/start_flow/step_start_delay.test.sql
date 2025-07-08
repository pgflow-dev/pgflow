begin;
select plan(6);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with steps that have different start delays
select pgflow.create_flow('delay_test_flow');
select pgflow.add_step('delay_test_flow', 'no_delay_root');
select pgflow.add_step('delay_test_flow', 'delayed_root', start_delay => 300);
select pgflow.add_step('delay_test_flow', 'very_delayed_root', start_delay => 3600);
select pgflow.add_step('delay_test_flow', 'dependent_step', ARRAY['no_delay_root', 'delayed_root'], start_delay => 600);

-- Start the flow
select pgflow.start_flow('delay_test_flow', '{"test": "data"}'::jsonb);

-- TEST: Step tasks should be created for all root steps
select is(
  (
    select count(*)::int
    from pgflow.step_tasks
    where flow_slug = 'delay_test_flow'
      and step_slug in ('no_delay_root', 'delayed_root', 'very_delayed_root')
  ),
  3,
  'Step tasks should be created for all root steps'
);

-- TEST: Message without delay should be immediately visible
select is(
  (
    select count(*)::int
    from pgmq.q_delay_test_flow q
    join pgflow.step_tasks st on st.message_id = q.msg_id
    where st.step_slug = 'no_delay_root'
      and q.vt <= clock_timestamp()
  ),
  1,
  'Message for step without delay should be immediately visible'
);

-- TEST: Messages with delay should have future visibility timeout
select is(
  (
    select count(*)::int
    from pgmq.q_delay_test_flow q
    join pgflow.step_tasks st on st.message_id = q.msg_id
    where st.step_slug = 'delayed_root'
      and q.vt > clock_timestamp()
  ),
  1,
  'Message for delayed_root should have future visibility timeout'
);

-- TEST: Verify delayed_root has approximately 300 second delay
select ok(
  (
    select abs(extract(epoch from (q.vt - clock_timestamp())) - 300) < 2
    from pgmq.q_delay_test_flow q
    join pgflow.step_tasks st on st.message_id = q.msg_id
    where st.step_slug = 'delayed_root'
  ),
  'delayed_root message should have visibility timeout approximately 300 seconds in the future'
);

-- TEST: Verify very_delayed_root has approximately 3600 second delay
select ok(
  (
    select abs(extract(epoch from (q.vt - clock_timestamp())) - 3600) < 2
    from pgmq.q_delay_test_flow q
    join pgflow.step_tasks st on st.message_id = q.msg_id
    where st.step_slug = 'very_delayed_root'
  ),
  'very_delayed_root message should have visibility timeout approximately 3600 seconds in the future'
);

-- TEST: Dependent step should not have a task yet
select is(
  (
    select count(*)::int
    from pgflow.step_tasks
    where flow_slug = 'delay_test_flow'
      and step_slug = 'dependent_step'
  ),
  0,
  'Dependent step should not have a task created yet'
);

select * from finish();
rollback;
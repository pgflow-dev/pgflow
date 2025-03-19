begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: A step_task record should be created only for the root step
select is(
  (
    select
      array_agg(
        step_slug
        order by step_slug
      )
    from pgflow.step_tasks
    where flow_slug = 'sequential'
  ),
  array['first']::text [],
  'A step_task record should be created only for the root step'
);

-- TEST: The message in the queue should contain the correct step info
select is(
  (
    select q.message
    from pgflow.step_tasks as st
      inner join pgmq.q_sequential as q
        on st.message_id = q.msg_id
    where
      st.flow_slug = 'sequential'
      and st.step_slug = 'first'
  ),
  jsonb_build_object(
    'flow_slug', 'sequential',
    'run_id', (
      select run_id
      from pgflow.step_tasks
      where
        flow_slug = 'sequential'
        and step_slug = 'first'
    ),
    'step_slug', 'first',
    'task_index', 0
  ),
  'The message in the queue should contain the correct step info'
);

select finish();
rollback;

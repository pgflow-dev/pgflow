begin;
select plan(4);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start the flow
select pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- Ensure worker exists
select pgflow_tests.ensure_worker('sequential');

-- TEST: Initial remaining_steps should be 3 and status should be 'started'
select results_eq(
  $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
  $$ VALUES (3::int, 'started'::text) $$,
  'Initial remaining_steps should be 3 and status should be started'
);

-- Start and complete the first step's task
with msg_ids as (
  select array_agg(message_id) as ids
  from pgflow.step_tasks
  where run_id = (select run_id from pgflow.runs limit 1)
    and step_slug = 'first'
    and status = 'queued'
)
select pgflow.start_tasks(
  (select ids from msg_ids),
  '11111111-1111-1111-1111-111111111111'::uuid
);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '"first was successful"'::JSONB
);

-- TEST: After completing first step, remaining_steps should be 2 and status still 'started'
select results_eq(
  $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
  $$ VALUES (2::int, 'started'::text) $$,
  'After completing first step, remaining_steps should be 2 and status still started'
);

-- Start and complete the second step's task
with msg_ids as (
  select array_agg(message_id) as ids
  from pgflow.step_tasks
  where run_id = (select run_id from pgflow.runs limit 1)
    and step_slug = 'second'
    and status = 'queued'
)
select pgflow.start_tasks(
  (select ids from msg_ids),
  '11111111-1111-1111-1111-111111111111'::uuid
);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'second',
  0,
  '"second was successful"'::JSONB
);

-- TEST: After completing second step, remaining_steps should be 1 and status still 'started'
select results_eq(
  $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
  $$ VALUES (1::int, 'started'::text) $$,
  'After completing second step, remaining_steps should be 1 and status still started'
);

-- Start and complete the last step's task
with msg_ids as (
  select array_agg(message_id) as ids
  from pgflow.step_tasks
  where run_id = (select run_id from pgflow.runs limit 1)
    and step_slug = 'last'
    and status = 'queued'
)
select pgflow.start_tasks(
  (select ids from msg_ids),
  '11111111-1111-1111-1111-111111111111'::uuid
);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'last',
  0,
  '"last was successful"'::JSONB
);

-- TEST: Final remaining_steps should be 0 and status should be 'completed'
select results_eq(
  $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
  $$ VALUES (0::int, 'completed'::text) $$,
  'Final remaining_steps should be 0 and status should be completed'
);

select finish();
rollback;

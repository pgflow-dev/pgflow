begin;
select plan(4);
select pgflow_tests.reset_db();

select pgflow.create_flow('timestamp_flow');
select pgflow.add_step('timestamp_flow', 'test_task');
select pgflow.start_flow('timestamp_flow', '"hello"'::jsonb);

-- TEST: Initially started_at should be null for queued task
select is(
  (select started_at from pgflow.step_tasks where step_slug = 'test_task'),
  null,
  'started_at should be null for queued task'
);

-- Start the task using start_tasks
select pgflow_tests.ensure_worker('timestamp_flow');
with msg_ids as (
  select array_agg(msg_id) as ids
  from pgflow.read_with_poll('timestamp_flow', 10, 5, 1, 100)
)
select pgflow.start_tasks(
  (select ids from msg_ids), 
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- TEST: started_at should be set after start_tasks
select isnt(
  (select started_at from pgflow.step_tasks where step_slug = 'test_task'),
  null,
  'started_at should be set after start_tasks'
);

-- TEST: started_at should be after queued_at
select ok(
  (select started_at >= queued_at from pgflow.step_tasks where step_slug = 'test_task'),
  'started_at should be after queued_at'
);

-- TEST: started_at should be recent (within last minute)
select ok(
  (select started_at >= now() - interval '1 minute' from pgflow.step_tasks where step_slug = 'test_task'),
  'started_at should be recent (within last minute)'
);

select finish();
rollback;
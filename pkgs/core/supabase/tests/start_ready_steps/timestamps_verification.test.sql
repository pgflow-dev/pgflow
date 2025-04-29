begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Complete the first task to make the second step ready
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '{"result": "first completed"}'::jsonb
);

-- TEST: Second step should have started_at timestamp set
select isnt(
  (select started_at from pgflow.step_states 
   where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'second'),
  null,
  'Second step should have started_at timestamp set'
);

-- TEST: started_at should be after created_at
select ok(
  (select started_at > created_at from pgflow.step_states 
   where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'second'),
  'started_at should be after created_at'
);

select finish();
rollback;

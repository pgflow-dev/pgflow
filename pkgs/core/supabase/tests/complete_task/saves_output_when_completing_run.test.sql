begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('two_roots_left_right');

-- Start the flow
select pgflow.start_flow('two_roots_left_right', '"hello"'::JSONB);

-- Ensure worker exists
select pgflow_tests.ensure_worker('two_roots_left_right');

-- Start and complete all the steps
with msg_ids as (
  select array_agg(message_id) as ids
  from pgflow.step_tasks
  where run_id = (select run_id from pgflow.runs limit 1)
    and step_slug = 'connected_root'
    and status = 'queued'
)
select pgflow.start_tasks((select ids from msg_ids), '11111111-1111-1111-1111-111111111111'::uuid);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'connected_root',
  0,
  '"root successful"'::JSONB
);

with msg_ids as (
  select array_agg(message_id) as ids
  from pgflow.step_tasks
  where run_id = (select run_id from pgflow.runs limit 1)
    and step_slug = 'left'
    and status = 'queued'
)
select pgflow.start_tasks((select ids from msg_ids), '11111111-1111-1111-1111-111111111111'::uuid);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'left',
  0,
  '"left successful"'::JSONB
);

with msg_ids as (
  select array_agg(message_id) as ids
  from pgflow.step_tasks
  where run_id = (select run_id from pgflow.runs limit 1)
    and step_slug = 'right'
    and status = 'queued'
)
select pgflow.start_tasks((select ids from msg_ids), '11111111-1111-1111-1111-111111111111'::uuid);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'right',
  0,
  '"right successful"'::JSONB
);

with msg_ids as (
  select array_agg(message_id) as ids
  from pgflow.step_tasks
  where run_id = (select run_id from pgflow.runs limit 1)
    and step_slug = 'disconnected_root'
    and status = 'queued'
)
select pgflow.start_tasks((select ids from msg_ids), '11111111-1111-1111-1111-111111111111'::uuid);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'disconnected_root',
  0,
  '"disconnected successful"'::JSONB
);

-- TEST: Make sure that run is completed
select results_eq(
  $$ SELECT status::text, remaining_steps::int FROM pgflow.runs LIMIT 1 $$,
  $$ VALUES ('completed'::text, 0::int) $$,
  'Run was completed'
);

-- noqa: disable=all
PREPARE expected_output AS SELECT
    jsonb_build_object(
        'disconnected_root', '"disconnected successful"'::JSONB,
        'left', '"left successful"'::JSONB,
        'right', '"right successful"'::JSONB
    );
-- noqa: enable=all
SELECT results_eq (
$$ SELECT output FROM pgflow.runs LIMIT 1 $$,
'expected_output',
'Outputs of all final steps were saved as run output'
) ;

SELECT finish () ;
ROLLBACK ;
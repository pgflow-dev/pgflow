begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('two_roots_left_right');

-- Start the flow
select pgflow.start_flow('two_roots_left_right', '"hello"'::JSONB);

-- Ensure worker exists
select pgflow_tests.ensure_worker('two_roots_left_right');

-- Start and complete each step with correct output based on the step returned
with task as (
  select * from pgflow_tests.read_and_start('two_roots_left_right') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  case task.step_slug
    when 'connected_root' then '"root successful"'::JSONB
    when 'disconnected_root' then '"disconnected successful"'::JSONB
    when 'left' then '"left successful"'::JSONB
    when 'right' then '"right successful"'::JSONB
  end
) from task;

with task as (
  select * from pgflow_tests.read_and_start('two_roots_left_right') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  case task.step_slug
    when 'connected_root' then '"root successful"'::JSONB
    when 'disconnected_root' then '"disconnected successful"'::JSONB
    when 'left' then '"left successful"'::JSONB
    when 'right' then '"right successful"'::JSONB
  end
) from task;

with task as (
  select * from pgflow_tests.read_and_start('two_roots_left_right') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  case task.step_slug
    when 'connected_root' then '"root successful"'::JSONB
    when 'disconnected_root' then '"disconnected successful"'::JSONB
    when 'left' then '"left successful"'::JSONB
    when 'right' then '"right successful"'::JSONB
  end
) from task;

with task as (
  select * from pgflow_tests.read_and_start('two_roots_left_right') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  case task.step_slug
    when 'connected_root' then '"root successful"'::JSONB
    when 'disconnected_root' then '"disconnected successful"'::JSONB
    when 'left' then '"left successful"'::JSONB
    when 'right' then '"right successful"'::JSONB
  end
) from task;

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
begin;
select plan(6);
select pgflow_tests.reset_db();

-- Test: Compile a flow with flow-level options from shape
select pgflow._create_flow_from_shape(
  'flow_with_options',
  '{
    "steps": [
      {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail"}
    ],
    "options": {
      "maxAttempts": 5,
      "baseDelay": 10,
      "timeout": 120
    }
  }'::jsonb
);

-- Verify flow options were applied
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.flows WHERE flow_slug = 'flow_with_options' $$,
  $$ VALUES (5, 10, 120) $$,
  'Flow should have options from shape'
);

-- Test: Compile a flow with step-level options from shape
select pgflow._create_flow_from_shape(
  'flow_with_step_options',
  '{
    "steps": [
      {
        "slug": "step1",
        "stepType": "single",
        "dependencies": [],
        "whenUnmet": "skip",
        "whenFailed": "fail",
        "options": {
          "maxAttempts": 7,
          "baseDelay": 15,
          "timeout": 90,
          "startDelay": 1000
        }
      }
    ]
  }'::jsonb
);

-- Verify step options were applied
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay FROM pgflow.steps WHERE flow_slug = 'flow_with_step_options' $$,
  $$ VALUES (7, 15, 90, 1000) $$,
  'Step should have options from shape'
);

-- Test: Compile a flow with no options (defaults should be used)
select pgflow._create_flow_from_shape(
  'flow_no_options',
  '{
    "steps": [
      {"slug": "step1", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenFailed": "fail"}
    ]
  }'::jsonb
);

-- Verify flow uses default options
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.flows WHERE flow_slug = 'flow_no_options' $$,
  $$ VALUES (3, 5, 60) $$,
  'Flow without options in shape should use defaults'
);

-- Verify step uses NULL options (inherits from flow)
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay FROM pgflow.steps WHERE flow_slug = 'flow_no_options' $$,
  $$ VALUES (NULL::int, NULL::int, NULL::int, NULL::int) $$,
  'Step without options in shape should have NULL (inherit from flow)'
);

-- Test: Compile with partial options (missing options should be NULL/default)
select pgflow._create_flow_from_shape(
  'flow_partial_options',
  '{
    "steps": [
      {
        "slug": "step1",
        "stepType": "single",
        "dependencies": [],
        "whenUnmet": "skip",
        "whenFailed": "fail",
        "options": {
          "timeout": 30
        }
      }
    ],
    "options": {
      "maxAttempts": 10
    }
  }'::jsonb
);

-- Verify partial flow options
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.flows WHERE flow_slug = 'flow_partial_options' $$,
  $$ VALUES (10, 5, 60) $$,
  'Flow with partial options should use defaults for missing options'
);

-- Verify partial step options
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay FROM pgflow.steps WHERE flow_slug = 'flow_partial_options' $$,
  $$ VALUES (NULL::int, NULL::int, 30, NULL::int) $$,
  'Step with partial options should have NULL for missing options'
);

select finish();
rollback;

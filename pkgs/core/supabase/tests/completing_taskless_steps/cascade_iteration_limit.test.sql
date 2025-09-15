begin;
select plan(4);
select pgflow_tests.reset_db();

-- Test: Cascade iteration safety limit (50 iterations)
select diag('Testing cascade iteration safety limit prevents infinite loops');

-- Create a flow with 51 chained map steps to exceed the 50 iteration limit
select pgflow.create_flow('long_cascade_flow');

-- Create first map step (root)
select pgflow.add_step(
  flow_slug => 'long_cascade_flow',
  step_slug => 'map_0',
  step_type => 'map'
);

-- Create 50 more chained map steps (map_1 through map_50)
DO $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..50 LOOP
    PERFORM pgflow.add_step(
      flow_slug => 'long_cascade_flow',
      step_slug => 'map_' || i,
      deps_slugs => ARRAY['map_' || (i-1)],
      step_type => 'map'
    );
  END LOOP;
END $$;

-- Verify we created 51 steps
select is(
  (select count(*) from pgflow.steps where flow_slug = 'long_cascade_flow'),
  51::bigint,
  '51 map steps should be created'
);

-- Try to start flow with empty array - should hit the iteration limit
-- The cascade function should raise an exception after 50 iterations
-- We need to catch this exception in the test
DO $$
DECLARE
  v_error_caught BOOLEAN := FALSE;
  v_error_message TEXT;
BEGIN
  BEGIN
    PERFORM pgflow.start_flow('long_cascade_flow', '[]'::jsonb);
  EXCEPTION
    WHEN OTHERS THEN
      v_error_caught := TRUE;
      v_error_message := SQLERRM;
  END;

  -- Store results in a temp table for the test to check
  CREATE TEMP TABLE cascade_error_test (
    error_caught BOOLEAN,
    error_message TEXT
  );
  INSERT INTO cascade_error_test VALUES (v_error_caught, v_error_message);
END $$;

-- Verify an error was caught
select is(
  (select error_caught from cascade_error_test),
  true,
  'Should catch an exception when cascade exceeds iteration limit'
);

-- Verify the error message mentions the iteration limit
select ok(
  (select error_message from cascade_error_test) LIKE '%Cascade loop exceeded safety limit of%iterations%',
  'Error message should mention exceeding 50 iteration safety limit'
);

-- Verify no run was created (transaction should have rolled back)
select is(
  (select count(*) from pgflow.runs where flow_slug = 'long_cascade_flow'),
  0::bigint,
  'No run should be created when cascade fails with iteration limit'
);

select * from finish();
rollback;
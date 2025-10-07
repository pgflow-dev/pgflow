create or replace function pgflow.start_flow(
  flow_slug TEXT,
  input JSONB,
  run_id UUID default null
)
returns setof PGFLOW.RUNS
language plpgsql
set search_path to ''
volatile
as $$
declare
  v_created_run pgflow.runs%ROWTYPE;
  v_root_map_count int;
begin

-- ==========================================
-- VALIDATION: Root map array input
-- ==========================================
WITH root_maps AS (
  SELECT step_slug
  FROM pgflow.steps
  WHERE steps.flow_slug = start_flow.flow_slug
    AND steps.step_type = 'map'
    AND steps.deps_count = 0
)
SELECT COUNT(*) INTO v_root_map_count FROM root_maps;

-- If we have root map steps, validate that input is an array
IF v_root_map_count > 0 THEN
  -- First check for NULL (should be caught by NOT NULL constraint, but be defensive)
  IF start_flow.input IS NULL THEN
    RAISE EXCEPTION 'Flow % has root map steps but input is NULL', start_flow.flow_slug;
  END IF;
  
  -- Then check if it's not an array
  IF jsonb_typeof(start_flow.input) != 'array' THEN
    RAISE EXCEPTION 'Flow % has root map steps but input is not an array (got %)', 
      start_flow.flow_slug, jsonb_typeof(start_flow.input);
  END IF;
END IF;

-- ==========================================
-- MAIN CTE CHAIN: Create run and step states
-- ==========================================
WITH
  -- ---------- Gather flow metadata ----------
  flow_steps AS (
    SELECT steps.flow_slug, steps.step_slug, steps.step_type, steps.deps_count
    FROM pgflow.steps
    WHERE steps.flow_slug = start_flow.flow_slug
  ),
  -- ---------- Create run record ----------
  created_run AS (
    INSERT INTO pgflow.runs (run_id, flow_slug, input, remaining_steps)
    VALUES (
      COALESCE(start_flow.run_id, gen_random_uuid()),
      start_flow.flow_slug,
      start_flow.input,
      (SELECT count(*) FROM flow_steps)
    )
    RETURNING *
  ),
  -- ---------- Create step states ----------
  -- Sets initial_tasks: known for root maps, NULL for dependent maps
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, remaining_deps, initial_tasks)
    SELECT
      fs.flow_slug,
      (SELECT created_run.run_id FROM created_run),
      fs.step_slug,
      fs.deps_count,
      -- Updated logic for initial_tasks:
      CASE
        WHEN fs.step_type = 'map' AND fs.deps_count = 0 THEN
          -- Root map: get array length from input
          CASE
            WHEN jsonb_typeof(start_flow.input) = 'array' THEN
              jsonb_array_length(start_flow.input)
            ELSE
              1
          END
        WHEN fs.step_type = 'map' AND fs.deps_count > 0 THEN
          -- Dependent map: unknown until dependencies complete
          NULL
        ELSE
          -- Single steps: always 1 task
          1
      END
    FROM flow_steps fs
  )
SELECT * FROM created_run INTO v_created_run;

-- ==========================================
-- POST-CREATION ACTIONS
-- ==========================================

-- ---------- Broadcast run:started event ----------
PERFORM realtime.send(
  jsonb_build_object(
    'event_type', 'run:started',
    'run_id', v_created_run.run_id,
    'flow_slug', v_created_run.flow_slug,
    'input', v_created_run.input,
    'status', 'started',
    'remaining_steps', v_created_run.remaining_steps,
    'started_at', v_created_run.started_at
  ),
  'run:started',
  concat('pgflow:run:', v_created_run.run_id),
  false
);

-- ---------- Complete taskless steps ----------
-- Handle empty array maps that should auto-complete
PERFORM pgflow.cascade_complete_taskless_steps(v_created_run.run_id);

-- ---------- Start initial steps ----------
-- Start root steps (those with no dependencies)
PERFORM pgflow.start_ready_steps(v_created_run.run_id);

RETURN QUERY SELECT * FROM pgflow.runs where pgflow.runs.run_id = v_created_run.run_id;

end;
$$;

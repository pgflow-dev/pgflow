create or replace function pgflow.start_flow(
  flow_slug text,
  input jsonb,
  run_id uuid default null,
  realtime text default null
)
returns setof pgflow.runs
language sql
set search_path to ''
volatile
as $$
WITH
  flow_steps AS (
    SELECT steps.flow_slug, steps.step_slug, steps.deps_count
    FROM pgflow.steps
    WHERE steps.flow_slug = $1
  ),
  target_channel AS (
    SELECT 
      CASE 
        WHEN $4 = 'true' THEN concat('pgflow:run:', COALESCE($3, gen_random_uuid()))
        WHEN $4 = 'false' OR $4 IS NULL THEN NULL
        ELSE $4::text
      END as realtime_channel,
      COALESCE($3, gen_random_uuid()) as final_run_id
  ),
  created_run AS (
    INSERT INTO pgflow.runs (run_id, flow_slug, input, remaining_steps, realtime_channel)
    SELECT tc.final_run_id, $1, $2, COALESCE((SELECT count(*) FROM flow_steps), 0), tc.realtime_channel
    FROM target_channel tc
    RETURNING *
  ),
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, remaining_deps)
    SELECT s.flow_slug, cr.run_id, s.step_slug, s.deps_count
    FROM pgflow.steps s, created_run cr
    WHERE s.flow_slug = $1
  ),
  broadcast_run_started AS (
    SELECT pgflow.maybe_realtime_send(
      jsonb_build_object(
        'event_type', 'run:started',
        'run_id', run_id,
        'flow_slug', flow_slug,
        'input', input,
        'status', 'started',
        'remaining_steps', remaining_steps,
        'started_at', started_at
      ),
      'run:started',
      realtime_channel
    )
    FROM created_run
  ),
  kick_off AS (
    SELECT pgflow.start_ready_steps(run_id) FROM created_run
  )
SELECT * FROM created_run;
$$;

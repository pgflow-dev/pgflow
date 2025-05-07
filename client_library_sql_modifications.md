# PgFlow Client Library SQL Modifications

This document outlines the SQL modifications needed to implement the broadcast events system for PgFlow's client library.

## Overview

For the client library to receive real-time updates about flow runs and steps, we need to add broadcast events to key SQL functions. These modifications will:

1. Send broadcast events when run and step statuses change
2. Use a consistent naming convention for channels and events
3. Include all necessary data in the event payloads

## Channel and Event Naming Convention

- **Channel Name**: `pgflow:run:<run_id>`
- **Event Naming Format**:
  - `run:suffix` for run-level events (e.g., `run:completed`)
  - `<step_slug>:suffix` for step-level events (e.g., `scrape_website:completed`)

## Functions to Modify

| SQL Function | Event Name | Trigger Point | Payload |
|-------------|------------|--------------|---------|
| `start_flow.sql` | `run:started` | After run creation | `{ run_id, flow_slug, input, remaining_steps, started_at }` |
| `start_ready_steps.sql` | `<step_slug>:started` | After steps are started | `{ run_id, step_slug, started_at }` |
| `complete_task.sql` | `<step_slug>:completed` | When step completes | `{ run_id, step_slug, output, completed_at }` |
| `fail_task.sql` | `<step_slug>:failed` | When step fails | `{ run_id, step_slug, error_message, failed_at }` |
| `maybe_complete_run.sql` | `run:completed` | When run completes | `{ run_id, output, completed_at }` |

## SQL Modifications

### 1. `start_flow.sql`

Add after the run is created (after line 38):

```sql
-- Send broadcast event for run started
PERFORM realtime.send(
  jsonb_build_object(
    'run_id', v_created_run.run_id,
    'flow_slug', v_created_run.flow_slug,
    'input', v_created_run.input,
    'remaining_steps', v_created_run.remaining_steps,
    'started_at', v_created_run.started_at
  ),
  'run:started',
  concat('pgflow:run:', v_created_run.run_id),
  false
);
```

### 2. `start_ready_steps.sql`

Modify the query to include broadcasting (after step states are updated):

```sql
WITH ready_steps AS (...),
started_step_states AS (...),
sent_messages AS (...),
broadcast_events AS (
  SELECT 
    realtime.send(
      jsonb_build_object(
        'run_id', started_step.run_id,
        'step_slug', started_step.step_slug,
        'started_at', started_step.started_at
      ),
      concat(started_step.step_slug, ':started'),
      concat('pgflow:run:', started_step.run_id),
      false
    )
  FROM started_step_states AS started_step
)
INSERT INTO pgflow.step_tasks...
```

### 3. `complete_task.sql`

Add after updating step state (after line 93, before the RETURN statement):

```sql
-- Send broadcast event for step completed
PERFORM realtime.send(
  jsonb_build_object(
    'run_id', complete_task.run_id,
    'step_slug', complete_task.step_slug,
    'output', complete_task.output,
    'completed_at', now()
  ),
  concat(complete_task.step_slug, ':completed'),
  concat('pgflow:run:', complete_task.run_id),
  false
);
```

### 4. `fail_task.sql`

Add after step/run failure is recorded (after line 83, before the retry handling):

```sql
-- Send broadcast event for step failed
WITH failed_step AS (
  SELECT * FROM pgflow.step_states
  WHERE run_id = fail_task.run_id AND step_slug = fail_task.step_slug
)
PERFORM realtime.send(
  jsonb_build_object(
    'run_id', fail_task.run_id,
    'step_slug', fail_task.step_slug,
    'error_message', fail_task.error_message,
    'failed_at', (SELECT failed_at FROM failed_step)
  ),
  concat(fail_task.step_slug, ':failed'),
  concat('pgflow:run:', fail_task.run_id),
  false
);

-- If the run was also failed as a result, send run:failed event
WITH failed_run AS (
  SELECT * FROM pgflow.runs 
  WHERE run_id = fail_task.run_id AND status = 'failed'
)
PERFORM realtime.send(
  jsonb_build_object(
    'run_id', fail_task.run_id,
    'error_message', fail_task.error_message,
    'failed_at', (SELECT failed_at FROM failed_run)
  ),
  'run:failed',
  concat('pgflow:run:', fail_task.run_id),
  false
) 
WHERE EXISTS (SELECT 1 FROM failed_run);
```

### 5. `maybe_complete_run.sql`

Add after updating the run status (after line 30):

```sql
-- Send broadcast event for run completed
WITH completed_run AS (
  SELECT * FROM pgflow.runs 
  WHERE run_id = maybe_complete_run.run_id AND status = 'completed'
)
PERFORM realtime.send(
  jsonb_build_object(
    'run_id', maybe_complete_run.run_id,
    'output', (SELECT output FROM completed_run),
    'completed_at', (SELECT completed_at FROM completed_run)
  ),
  'run:completed',
  concat('pgflow:run:', maybe_complete_run.run_id),
  false
) 
WHERE EXISTS (SELECT 1 FROM completed_run);
```

## Additional Function: `pgflow.start_flow_with_states`

We also need to create a new function that provides a complete initial state snapshot:

```sql
CREATE OR REPLACE FUNCTION pgflow.start_flow_with_states(
  p_flow_slug TEXT,
  p_input JSONB,
  p_run_id UUID DEFAULT NULL
) RETURNS TABLE(
  run PGFLOW.RUNS,
  steps PGFLOW.STEP_STATES[]
) AS $$
DECLARE
  v_run_id UUID;
BEGIN
  -- Start the flow using existing function
  SELECT run_id INTO v_run_id FROM pgflow.start_flow(p_flow_slug, p_input, p_run_id) LIMIT 1;
  
  -- Return the run and all its steps
  RETURN QUERY
  SELECT 
    r.*,
    ARRAY(
      SELECT s FROM pgflow.step_states s 
      WHERE s.run_id = v_run_id
      ORDER BY s.step_slug
    ) as steps
  FROM pgflow.runs r
  WHERE r.run_id = v_run_id;
END;
$$ LANGUAGE plpgsql;
```

## Function for Refreshing State 

This additional function will be used for reconnections and observing existing runs:

```sql
CREATE OR REPLACE FUNCTION pgflow.get_run_with_states(
  p_run_id UUID
) RETURNS TABLE(
  run PGFLOW.RUNS,
  steps PGFLOW.STEP_STATES[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.*,
    ARRAY(
      SELECT s FROM pgflow.step_states s 
      WHERE s.run_id = p_run_id
      ORDER BY s.step_slug
    ) as steps
  FROM pgflow.runs r
  WHERE r.run_id = p_run_id;
END;
$$ LANGUAGE plpgsql;
```

## Add Index for Efficiency

```sql
CREATE INDEX IF NOT EXISTS idx_step_states_run_only ON pgflow.step_states (run_id);
```

This index ensures efficient queries when filtering step states by run_id, which will be important for the client library when refreshing state or observing existing runs.
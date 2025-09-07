# Phase 2a Implementation Plan: Map Infrastructure (SQL Core)

## Overview

Phase 2a establishes the SQL-level foundation for map step functionality, building on Phase 1's completed `.array()` method. This phase focuses exclusively on the database schema and SQL Core layer, providing the infrastructure needed for parallel task spawning, execution, and result aggregation.

**Timeline**: 5-7 days  
**Risk Level**: MEDIUM - substantial SQL changes with complex task counting logic  
**Dependencies**: Phase 1 (`.array()` method) must be completed  
**Milestone**: Can create map steps and spawn/complete tasks via direct SQL calls

## Core Value Proposition

- **Parallel Task Spawning**: Map steps spawn N tasks based on array dependency length
- **Task Counting Infrastructure**: Robust task counting with complete set of invariants
- **Result Aggregation**: Ordered collection of task results into final array output
- **Queue Infrastructure**: Silent queue column addition (used in Phase 3)
- **Empty Array Handling**: Auto-completion for zero-task scenarios

## Database Schema Changes

### Migration Strategy

Using Atlas migrations with the established pkgs/core/scripts workflow:

```bash
# Navigate to pkgs/core directory
cd pkgs/core

# First update schema files in pkgs/core/schemas/, then generate migration
./scripts/atlas-migrate-diff add_map_infrastructure

# Review generated migration file, then apply and verify
pnpm nx verify-migrations core
```

### Schema Updates

#### 1. Enable Map Step Type

**File**: `pkgs/core/schemas/0050_table_steps.sql`

Update the existing steps table definition to include the new constraint:

```sql
-- In pkgs/core/schemas/0050_table_steps.sql, update the constraint:
CONSTRAINT steps_step_type_check CHECK (step_type IN ('single', 'map'))
```

#### 2. Add Task Counting Columns 

**File**: `pkgs/core/schemas/0040_table_step_states.sql`

Update the existing step_states table definition to include task counting columns:

```sql
-- In pkgs/core/schemas/0040_table_step_states.sql, add these columns:
initial_tasks INT NOT NULL DEFAULT 1,
total_tasks INT NOT NULL DEFAULT 1,
-- remaining_tasks already exists

-- Add these constraints:
CONSTRAINT initial_tasks_gte_zero CHECK (initial_tasks >= 0),
CONSTRAINT total_tasks_gte_zero CHECK (total_tasks >= 0),
CONSTRAINT remaining_tasks_gte_zero CHECK (remaining_tasks >= 0),
CONSTRAINT total_tasks_gte_initial CHECK (total_tasks >= initial_tasks),
CONSTRAINT total_tasks_gte_remaining CHECK (total_tasks >= remaining_tasks)
```

**Column documentation:**
```
COMMENT ON COLUMN pgflow.step_states.initial_tasks IS 'Original task count from array (immutable audit trail)';
COMMENT ON COLUMN pgflow.step_states.total_tasks IS 'Current total task count (for MVP, equals initial_tasks)';
COMMENT ON COLUMN pgflow.step_states.remaining_tasks IS 'Tasks not yet completed (decrements as tasks finish)';
```

**Column Semantics:**
- `initial_tasks`: Original task count from array dependency (never changes, audit trail)
- `total_tasks`: Current total task count (for MVP, always equals initial_tasks)
- `remaining_tasks`: Tasks not yet completed (decrements as tasks complete)

**Invariant Set:**
- `total_tasks >= initial_tasks >= 0`  
- `total_tasks >= remaining_tasks >= 0`
- `initial_tasks >= 0`
- `remaining_tasks >= 0`

#### 3. Remove Single Task Constraint

**File**: `pkgs/core/schemas/0060_table_step_tasks.sql`

Remove any existing constraint that limits steps to single task in the table definition:

```sql
-- In pkgs/core/schemas/0060_table_step_tasks.sql, remove or don't include:
-- CONSTRAINT only_single_task_per_step ...
```

#### 4. Add Queue Infrastructure (Phase 3 Preparation)

**File**: `pkgs/core/schemas/0020_table_flows.sql`, `0050_table_steps.sql`, `0060_table_step_tasks.sql`

Update the table definitions to include queue columns (Phase 3 preparation):

```sql
-- In pkgs/core/schemas/0020_table_flows.sql, add:
queue TEXT

-- In pkgs/core/schemas/0050_table_steps.sql, add:
queue TEXT

-- In pkgs/core/schemas/0060_table_step_tasks.sql, add:
queue TEXT

-- In pkgs/core/schemas/0070_indexes.sql (or appropriate file), add:
CREATE INDEX IF NOT EXISTS idx_step_tasks_queue_status 
  ON pgflow.step_tasks (queue, status) 
  WHERE queue IS NOT NULL AND status = 'queued';

-- Comments for documentation
COMMENT ON COLUMN pgflow.flows.queue IS 'Flow-level default queue: NULL=use flow_slug, string=specific queue for all steps';
COMMENT ON COLUMN pgflow.steps.queue IS 'Step-level queue override: NULL=inherit from flow, false=manual completion, string=specific queue';
COMMENT ON COLUMN pgflow.step_tasks.queue IS 'Resolved queue using hierarchy: step.queue -> flow.queue -> flow.slug';
```

## SQL Function Updates

### 1. Update `add_step` Function

**File**: `pkgs/core/schemas/0100_function_add_step.sql`

**Key Changes:**
- Add `step_type TEXT DEFAULT 'single'` parameter
- Add `queue TEXT DEFAULT NULL` parameter (Phase 3 infrastructure)
- Store both parameters in steps table

```sql
CREATE OR REPLACE FUNCTION pgflow.add_step(
  flow_slug TEXT,
  step_slug TEXT,
  step_type TEXT DEFAULT 'single',
  deps_slugs TEXT[] DEFAULT '{}',
  queue TEXT DEFAULT NULL,  -- NEW: Queue routing parameter (Phase 3 infrastructure)
  opt_max_attempts INT DEFAULT NULL,
  opt_base_delay INT DEFAULT NULL,
  opt_timeout INT DEFAULT NULL,
  opt_start_delay INT DEFAULT NULL
) 
RETURNS VOID
VOLATILE
SET search_path TO ''
LANGUAGE sql
AS $$
  INSERT INTO pgflow.steps (
    flow_slug, step_slug, step_type, step_index, deps_count,
    queue,  -- NEW: Store queue setting (unused until Phase 3)
    opt_max_attempts, opt_base_delay, opt_timeout, opt_start_delay
  ) VALUES (
    add_step.flow_slug,
    add_step.step_slug, 
    add_step.step_type,  -- NEW: Store step type
    (
      SELECT COALESCE(MAX(steps.step_index), -1) + 1 
      FROM pgflow.steps
      WHERE steps.flow_slug = add_step.flow_slug
    ),
    array_length(deps_slugs, 1),
    add_step.queue,  -- NEW: Store queue parameter (defaults to NULL)
    add_step.opt_max_attempts,
    add_step.opt_base_delay,
    add_step.opt_timeout,
    add_step.opt_start_delay
  );
  
  -- Insert dependencies (unchanged)
  INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
  SELECT add_step.flow_slug, unnest(deps_slugs), add_step.step_slug
  WHERE deps_slugs IS NOT NULL AND array_length(deps_slugs, 1) > 0;
$$;
```

### 2. Update `start_ready_steps` Function

**File**: `pkgs/core/schemas/0100_function_start_ready_steps.sql`

**Key Changes:**
1. Dynamic task generation using `generate_series(0, remaining_tasks - 1)`
2. Auto-completion for zero-task steps (empty arrays)
3. Queue-aware message sending (defaults to flow_slug)
4. Map step task count calculation from array dependencies

```sql
CREATE OR REPLACE FUNCTION pgflow.start_ready_steps(flow_slug TEXT)
RETURNS TABLE(tasks_spawned INT, steps_completed INT)
VOLATILE 
SET search_path TO ''
LANGUAGE sql
AS $$
  WITH ready_steps AS (
    SELECT 
      ss.run_id,
      ss.step_slug,
      s.step_type,
      COALESCE(s.queue, start_ready_steps.flow_slug) as resolved_queue,  -- NEW: Resolve queue hierarchy
      CASE 
        WHEN s.step_type = 'map' THEN
          -- Calculate task count from array dependency
          (SELECT COALESCE(jsonb_array_length(
            (SELECT output FROM pgflow.step_states dep_state 
             WHERE dep_state.run_id = ss.run_id 
               AND dep_state.step_slug = (
                 SELECT d.dep_slug FROM pgflow.deps d 
                 WHERE d.flow_slug = ss.flow_slug 
                   AND d.step_slug = ss.step_slug 
                 LIMIT 1
               )
               AND dep_state.status = 'completed')
          ), 0))
        ELSE 1  -- Single steps always spawn 1 task
      END as remaining_tasks
    FROM pgflow.step_states ss
    JOIN pgflow.steps s ON s.flow_slug = ss.flow_slug AND s.step_slug = ss.step_slug
    WHERE ss.flow_slug = start_ready_steps.flow_slug
      AND ss.status = 'created' 
      AND ss.remaining_deps = 0
  ),
  update_task_counts AS (
    -- Update step_states with calculated task counts for map steps
    UPDATE pgflow.step_states
    SET 
      initial_tasks = rs.remaining_tasks,
      total_tasks = rs.remaining_tasks,
      remaining_tasks = rs.remaining_tasks
    FROM ready_steps rs
    WHERE step_states.run_id = rs.run_id 
      AND step_states.step_slug = rs.step_slug
      AND step_states.flow_slug = start_ready_steps.flow_slug
  ),
  complete_zero_task_steps AS (
    -- Auto-complete steps with zero tasks (empty arrays)
    UPDATE pgflow.step_states
    SET 
      status = 'completed',
      completed_at = NOW(),
      output = '[]'::jsonb  -- Empty array output
    FROM ready_steps rs
    WHERE step_states.run_id = rs.run_id 
      AND step_states.step_slug = rs.step_slug
      AND step_states.flow_slug = start_ready_steps.flow_slug
      AND rs.remaining_tasks = 0
    RETURNING 1 as completed_step
  ),
  spawn_tasks AS (
    INSERT INTO pgflow.step_tasks (
      flow_slug, run_id, step_slug, task_index, 
      queue,  -- NEW: Inherit resolved queue
      status, 
      message_id  -- NEW: Queue-aware message creation
    )
    SELECT 
      start_ready_steps.flow_slug,
      rs.run_id,
      rs.step_slug,
      task_index.idx,
      rs.resolved_queue,
      'queued' as status,
      pgmq.send(
        rs.resolved_queue,  -- NEW: Use resolved queue (Phase 3 infrastructure)
        jsonb_build_object(
          'run_id', rs.run_id,
          'step_slug', rs.step_slug,
          'task_index', task_index.idx
        )
      ) as message_id
    FROM ready_steps rs
    CROSS JOIN generate_series(0, rs.remaining_tasks - 1) AS task_index(idx)
    WHERE rs.remaining_tasks > 0  -- Only spawn tasks for non-empty arrays
    RETURNING 1
  ),
  update_step_states AS (
    UPDATE pgflow.step_states
    SET 
      status = 'started',
      started_at = NOW()
    FROM ready_steps rs
    WHERE step_states.run_id = rs.run_id 
      AND step_states.step_slug = rs.step_slug
      AND step_states.flow_slug = start_ready_steps.flow_slug
      AND rs.remaining_tasks > 0  -- Only for non-zero task steps
    RETURNING 1
  )
  SELECT 
    (SELECT COUNT(*) FROM spawn_tasks) as tasks_spawned,
    (SELECT COUNT(*) FROM complete_zero_task_steps) as steps_completed;
$$;
```

### 3. Update `start_tasks` Function

**File**: `pkgs/core/schemas/0120_function_start_tasks.sql`

**Key Changes:**
- Accept `queue_name` parameter instead of flow_slug (Phase 3 preparation)  
- Map-specific input construction (element extraction from array)
- Queue-based task filtering

```sql
CREATE OR REPLACE FUNCTION pgflow.start_tasks(
  queue_name TEXT,  -- NEW: Accept queue name (Phase 3 infrastructure)
  msg_ids BIGINT[],
  worker_id UUID
)
RETURNS SETOF pgflow.step_task_record
VOLATILE
SET search_path TO ''
LANGUAGE sql
AS $$
  WITH tasks AS (
    SELECT
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.message_id
    FROM pgflow.step_tasks AS task
    WHERE COALESCE(task.queue, task.flow_slug) = start_tasks.queue_name  -- NEW: Queue-aware filtering
      AND task.message_id = ANY(msg_ids)
      AND task.status = 'queued'
  ),
  start_tasks_update AS (
    UPDATE pgflow.step_tasks
    SET 
      attempts_count = attempts_count + 1,
      status = 'started',
      started_at = NOW(),
      last_worker_id = worker_id
    FROM tasks
    WHERE step_tasks.message_id = tasks.message_id
      AND step_tasks.status = 'queued'
  ),
  runs AS (
    SELECT DISTINCT
      tasks.run_id,
      runs.input
    FROM tasks
    JOIN pgflow.runs ON runs.run_id = tasks.run_id
  ),
  deps_outputs AS (
    SELECT
      tasks.run_id,
      tasks.step_slug,
      jsonb_object_agg(dep_states.step_slug, dep_states.output) as deps_output
    FROM tasks
    LEFT JOIN pgflow.deps ON
      deps.flow_slug = tasks.flow_slug AND
      deps.step_slug = tasks.step_slug
    LEFT JOIN pgflow.step_states AS dep_states ON
      dep_states.run_id = tasks.run_id AND
      dep_states.step_slug = deps.dep_slug AND
      dep_states.status = 'completed'
    GROUP BY tasks.run_id, tasks.step_slug
  )
  SELECT
    st.flow_slug,
    st.run_id,
    st.step_slug,
    st.task_index,  -- NEW: Include task_index in response
    CASE 
      WHEN (SELECT step_type FROM pgflow.steps s 
            WHERE s.flow_slug = st.flow_slug AND s.step_slug = st.step_slug) = 'map' THEN
        -- NEW: Map step input construction - extract element at task_index
        jsonb_build_object('run', r.input) || 
        jsonb_build_object('item', (
          SELECT jsonb_array_element(dep_out.deps_output->dep_slug, st.task_index)
          FROM pgflow.deps d
          WHERE d.flow_slug = st.flow_slug AND d.step_slug = st.step_slug
          LIMIT 1
        ))
      ELSE
        -- Standard input for single steps
        jsonb_build_object('run', r.input) || COALESCE(dep_out.deps_output, '{}'::jsonb)
    END AS input,
    st.message_id AS msg_id
  FROM tasks st
  JOIN runs r ON st.run_id = r.run_id
  LEFT JOIN deps_outputs dep_out ON
    dep_out.run_id = st.run_id AND
    dep_out.step_slug = st.step_slug
$$;
```

### 4. Update `complete_task` Function

**File**: `pkgs/core/schemas/0100_function_complete_task.sql`

**Key Changes:**
1. Map step result aggregation using task_index ordering
2. Task count propagation to map dependents
3. Auto-completion for empty array cases

```sql
CREATE OR REPLACE FUNCTION pgflow.complete_task(
  task_run_id UUID,
  task_step_slug TEXT,
  task_index INT,
  task_output JSONB
) 
RETURNS VOID
VOLATILE
SET search_path TO ''
LANGUAGE sql
AS $$
  WITH task_completion AS (
    UPDATE pgflow.step_tasks
    SET 
      status = 'completed',
      completed_at = NOW(),
      output = task_output
    WHERE run_id = task_run_id
      AND step_slug = task_step_slug
      AND task_index = complete_task.task_index
      AND status = 'started'
  ),
  updated_step_state AS (
    -- Update step state and handle completion
    UPDATE pgflow.step_states
    SET remaining_tasks = remaining_tasks - 1
    WHERE run_id = task_run_id
      AND step_slug = task_step_slug
    RETURNING *
  ),
  completed_step AS (
    -- Mark step as completed when all tasks finish
    UPDATE pgflow.step_states step_state
    SET 
      status = 'completed',
      completed_at = NOW(),
      output = CASE 
        WHEN (SELECT step_type FROM pgflow.steps s 
              WHERE s.flow_slug = step_state.flow_slug 
                AND s.step_slug = step_state.step_slug) = 'map' THEN
          -- NEW: Aggregate map task results in task_index order
          (SELECT jsonb_agg(task_output.output ORDER BY task_output.task_index)
           FROM pgflow.step_tasks task_output
           WHERE task_output.run_id = step_state.run_id
             AND task_output.step_slug = step_state.step_slug
             AND task_output.status = 'completed')
        ELSE
          -- Single step uses the task output directly
          task_output
      END
    FROM updated_step_state
    WHERE step_state.run_id = updated_step_state.run_id
      AND step_state.step_slug = updated_step_state.step_slug
      AND updated_step_state.remaining_tasks = 0
    RETURNING step_state.*
  ),
  propagate_to_map_dependents AS (
    -- NEW: Set task counts for map dependents when array steps complete
    UPDATE pgflow.step_states dependent_state
    SET 
      initial_tasks = CASE 
        WHEN dependent_step.step_type = 'map' THEN 
          COALESCE(jsonb_array_length(completed_step.output), 0)
        ELSE 1
      END,
      total_tasks = CASE 
        WHEN dependent_step.step_type = 'map' THEN
          COALESCE(jsonb_array_length(completed_step.output), 0)  
        ELSE 1
      END,
      remaining_tasks = CASE 
        WHEN dependent_step.step_type = 'map' THEN
          COALESCE(jsonb_array_length(completed_step.output), 0)
        ELSE 1  
      END
    FROM completed_step
    JOIN pgflow.deps ON 
      deps.flow_slug = completed_step.flow_slug AND
      deps.dep_slug = completed_step.step_slug
    JOIN pgflow.steps dependent_step ON
      dependent_step.flow_slug = deps.flow_slug AND
      dependent_step.step_slug = deps.step_slug
    WHERE dependent_state.run_id = completed_step.run_id
      AND dependent_state.step_slug = dependent_step.step_slug
      AND dependent_state.status = 'created'
  ),
  update_remaining_deps AS (
    UPDATE pgflow.step_states
    SET remaining_deps = remaining_deps - 1
    FROM completed_step
    JOIN pgflow.deps ON 
      deps.flow_slug = completed_step.flow_slug AND
      deps.dep_slug = completed_step.step_slug
    WHERE step_states.run_id = completed_step.run_id
      AND step_states.step_slug = deps.step_slug
  )
  SELECT NULL::VOID;
$$;
```

## Comprehensive Testing Strategy

### Test Structure Overview

Following the established pgflow testing patterns, comprehensive SQL tests will be organized by function:

```
pkgs/core/supabase/tests/
├── add_step/
│   ├── map_step_creation.test.sql           # NEW: Map step creation with step_type parameter
│   ├── step_type_validation.test.sql        # NEW: step_type constraint validation
│   └── queue_parameter_storage.test.sql     # NEW: Queue parameter storage (Phase 3 prep)
├── start_ready_steps/
│   ├── map_task_spawning.test.sql          # NEW: Dynamic task generation for map steps
│   ├── empty_array_handling.test.sql       # NEW: Zero-task auto-completion
│   ├── task_count_calculation.test.sql     # NEW: Task counting logic
│   └── queue_message_routing.test.sql      # NEW: Queue-aware message sending
├── start_tasks/
│   ├── map_input_construction.test.sql     # NEW: Element extraction for map tasks
│   ├── queue_based_filtering.test.sql      # NEW: Queue-based task filtering
│   └── task_index_handling.test.sql        # NEW: task_index in responses
├── complete_task/
│   ├── map_result_aggregation.test.sql     # NEW: Ordered result aggregation
│   ├── task_count_propagation.test.sql     # NEW: Propagation to map dependents
│   ├── empty_array_completion.test.sql     # NEW: Empty array result handling
│   └── task_counting_invariants.test.sql   # NEW: Comprehensive invariant testing
└── schema/
    ├── task_counting_columns.test.sql       # NEW: Column constraints and invariants
    ├── step_type_constraint.test.sql        # NEW: step_type validation
    └── queue_infrastructure.test.sql        # NEW: Queue column infrastructure
```

### Key Test Cases Implementation

#### 1. Map Task Spawning Test

**File**: `pkgs/core/supabase/tests/start_ready_steps/map_task_spawning.test.sql`

```sql
BEGIN;
SELECT plan(8);

-- Setup: Create flow with map step
SELECT pgflow_tests.reset_db();
SELECT pgflow.create_flow('map_test_flow');
SELECT pgflow.add_step('map_test_flow', 'array_step', 'single');
SELECT pgflow.add_step('map_test_flow', 'map_step', 'map', ARRAY['array_step']);

-- Create run and complete array step with 3 items
SELECT pgflow.start_flow('map_test_flow', '{"test": true}');

WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'map_test_flow'
)
SELECT pgflow.complete_task(
  (SELECT run_id FROM run_id_cte),
  'array_step',
  0,
  '[{"id": 1}, {"id": 2}, {"id": 3}]'::JSONB
);

-- Test map step task spawning
SELECT pgflow.start_ready_steps('map_test_flow');

-- Verify 3 tasks were spawned for map step
SELECT is(
  (SELECT COUNT(*) FROM pgflow.step_tasks WHERE step_slug = 'map_step')::INT,
  3,
  'Map step should spawn 3 tasks for 3-element array'
);

-- Verify task indexes are correct (0, 1, 2)
SELECT set_eq(
  $$ SELECT task_index FROM pgflow.step_tasks WHERE step_slug = 'map_step' ORDER BY task_index $$,
  $$ VALUES (0), (1), (2) $$,
  'Map tasks should have correct task_index values'
);

-- Verify task counting columns are set correctly
SELECT is(
  (SELECT initial_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  3,
  'initial_tasks should be set to 3'
);

SELECT is(
  (SELECT total_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  3,
  'total_tasks should be set to 3'
);

SELECT is(
  (SELECT remaining_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  3,
  'remaining_tasks should be set to 3'
);

-- Verify step_states status
SELECT is(
  (SELECT status FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'started',
  'Map step should be in started status'
);

-- Verify all tasks are queued
SELECT is(
  (SELECT COUNT(*) FROM pgflow.step_tasks WHERE step_slug = 'map_step' AND status = 'queued')::INT,
  3,
  'All map tasks should be in queued status'
);

-- Verify messages were sent to correct queue
SELECT is(
  (SELECT COUNT(*) FROM pgmq.q_map_test_flow)::INT,
  3,
  'Three messages should be sent to queue'
);

SELECT * FROM finish();
ROLLBACK;
```

#### 2. Empty Array Handling Test

**File**: `pkgs/core/supabase/tests/start_ready_steps/empty_array_handling.test.sql`

```sql
BEGIN;
SELECT plan(6);

-- Setup: Create flow with map step
SELECT pgflow_tests.reset_db();
SELECT pgflow.create_flow('empty_array_flow');
SELECT pgflow.add_step('empty_array_flow', 'array_step', 'single');
SELECT pgflow.add_step('empty_array_flow', 'map_step', 'map', ARRAY['array_step']);

-- Create run and complete array step with empty array
SELECT pgflow.start_flow('empty_array_flow', '{"test": true}');

WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'empty_array_flow'
)
SELECT pgflow.complete_task(
  (SELECT run_id FROM run_id_cte),
  'array_step',
  0,
  '[]'::JSONB
);

-- Test empty array handling
SELECT pgflow.start_ready_steps('empty_array_flow');

-- Verify no tasks were spawned
SELECT is(
  (SELECT COUNT(*) FROM pgflow.step_tasks WHERE step_slug = 'map_step')::INT,
  0,
  'No tasks should be spawned for empty array'
);

-- Verify step was auto-completed
SELECT is(
  (SELECT status FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'completed',
  'Map step should be auto-completed for empty array'
);

-- Verify empty array output
SELECT is(
  (SELECT output FROM pgflow.step_states WHERE step_slug = 'map_step'),
  '[]'::JSONB,
  'Map step output should be empty array'
);

-- Verify task counting for empty array
SELECT is(
  (SELECT initial_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  0,
  'initial_tasks should be 0 for empty array'
);

SELECT is(
  (SELECT total_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  0,
  'total_tasks should be 0 for empty array'
);

SELECT is(
  (SELECT remaining_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  0,
  'remaining_tasks should be 0 for empty array'
);

SELECT * FROM finish();
ROLLBACK;
```

#### 3. Task Counting Invariants Test

**File**: `pkgs/core/supabase/tests/complete_task/task_counting_invariants.test.sql`

```sql
BEGIN;
SELECT plan(12);

-- Setup comprehensive invariant testing
SELECT pgflow_tests.reset_db();
SELECT pgflow.create_flow('invariant_test');
SELECT pgflow.add_step('invariant_test', 'array_step', 'single');
SELECT pgflow.add_step('invariant_test', 'map_step', 'map', ARRAY['array_step']);

-- Create run with array step
SELECT pgflow.start_flow('invariant_test', '{"test": true}');

WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'invariant_test'
)
SELECT pgflow.complete_task(
  (SELECT run_id FROM run_id_cte),
  'array_step',
  0,
  '[{"a": 1}, {"b": 2}, {"c": 3}, {"d": 4}]'::JSONB
);

-- Start map step (4 tasks)
SELECT pgflow.start_ready_steps('invariant_test');

-- Test invariants during task completion
WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'invariant_test'
),
task_completion_1 AS (
  SELECT pgflow.complete_task(
    (SELECT run_id FROM run_id_cte),
    'map_step',
    0,
    '"result_0"'::JSONB
  )
)
SELECT ok(
  (SELECT total_tasks >= initial_tasks FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'Invariant: total_tasks >= initial_tasks (after 1 task)'
);

SELECT ok(
  (SELECT total_tasks >= remaining_tasks FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'Invariant: total_tasks >= remaining_tasks (after 1 task)'
);

SELECT ok(
  (SELECT initial_tasks >= 0 FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'Invariant: initial_tasks >= 0 (after 1 task)'
);

SELECT ok(
  (SELECT remaining_tasks >= 0 FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'Invariant: remaining_tasks >= 0 (after 1 task)'
);

-- Verify specific counts after 1 task completion
SELECT is(
  (SELECT initial_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  4,
  'initial_tasks should remain 4 (immutable)'
);

SELECT is(
  (SELECT total_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  4,
  'total_tasks should remain 4'
);

SELECT is(
  (SELECT remaining_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  3,
  'remaining_tasks should be 3 after completing 1 task'
);

-- Complete remaining tasks and test final state
WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'invariant_test'
)
SELECT pgflow.complete_task((SELECT run_id FROM run_id_cte), 'map_step', 1, '"result_1"'::JSONB);

WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'invariant_test'  
)
SELECT pgflow.complete_task((SELECT run_id FROM run_id_cte), 'map_step', 2, '"result_2"'::JSONB);

WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'invariant_test'
)
SELECT pgflow.complete_task((SELECT run_id FROM run_id_cte), 'map_step', 3, '"result_3"'::JSONB);

-- Test final invariants
SELECT ok(
  (SELECT total_tasks >= initial_tasks FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'Final invariant: total_tasks >= initial_tasks'
);

SELECT ok(
  (SELECT total_tasks >= remaining_tasks FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'Final invariant: total_tasks >= remaining_tasks'
);

SELECT ok(
  (SELECT initial_tasks >= 0 FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'Final invariant: initial_tasks >= 0'
);

SELECT ok(
  (SELECT remaining_tasks >= 0 FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'Final invariant: remaining_tasks >= 0'
);

-- Verify final state  
SELECT is(
  (SELECT remaining_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  0,
  'remaining_tasks should be 0 when all tasks complete'
);

SELECT * FROM finish();
ROLLBACK;
```

#### 4. Map Result Aggregation Test

**File**: `pkgs/core/supabase/tests/complete_task/map_result_aggregation.test.sql`

```sql
BEGIN;
SELECT plan(5);

-- Setup: Create map flow
SELECT pgflow_tests.reset_db();
SELECT pgflow.create_flow('aggregation_test');
SELECT pgflow.add_step('aggregation_test', 'array_step', 'single');
SELECT pgflow.add_step('aggregation_test', 'map_step', 'map', ARRAY['array_step']);

-- Create run and set up array
SELECT pgflow.start_flow('aggregation_test', '{"test": true}');

WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'aggregation_test'
)
SELECT pgflow.complete_task(
  (SELECT run_id FROM run_id_cte),
  'array_step', 
  0,
  '[10, 20, 30]'::JSONB
);

-- Start map step
SELECT pgflow.start_ready_steps('aggregation_test');

-- Complete map tasks in specific order to test ordering
WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'aggregation_test'
)
SELECT pgflow.complete_task((SELECT run_id FROM run_id_cte), 'map_step', 2, '"result_2"'::JSONB);

WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'aggregation_test'
)
SELECT pgflow.complete_task((SELECT run_id FROM run_id_cte), 'map_step', 0, '"result_0"'::JSONB);

WITH run_id_cte AS (
  SELECT run_id FROM pgflow.runs WHERE flow_slug = 'aggregation_test'
)
SELECT pgflow.complete_task((SELECT run_id FROM run_id_cte), 'map_step', 1, '"result_1"'::JSONB);

-- Verify aggregation maintains task_index order (not completion order)
SELECT is(
  (SELECT output FROM pgflow.step_states WHERE step_slug = 'map_step'),
  '["result_0", "result_1", "result_2"]'::JSONB,
  'Results should be aggregated in task_index order, not completion order'
);

-- Verify step is completed
SELECT is(
  (SELECT status FROM pgflow.step_states WHERE step_slug = 'map_step'),
  'completed',
  'Map step should be completed after all tasks finish'
);

-- Verify final task counts
SELECT is(
  (SELECT remaining_tasks FROM pgflow.step_states WHERE step_slug = 'map_step')::INT,
  0,
  'remaining_tasks should be 0 when completed'
);

-- Verify all individual tasks are completed
SELECT is(
  (SELECT COUNT(*) FROM pgflow.step_tasks WHERE step_slug = 'map_step' AND status = 'completed')::INT,
  3,
  'All individual tasks should be completed'
);

-- Verify completed timestamp is set
SELECT ok(
  (SELECT completed_at FROM pgflow.step_states WHERE step_slug = 'map_step') IS NOT NULL,
  'completed_at should be set when step completes'
);

SELECT * FROM finish();
ROLLBACK;
```

## Implementation Timeline

### Day 1-2: Schema Foundation
- **Morning**: Update schema files in `pkgs/core/schemas/`
  - Add map step type constraint
  - Add task counting columns with invariants
  - Remove single task constraint
  - Add queue infrastructure columns
- **Afternoon**: Generate and apply Atlas migration
  - Run `./scripts/atlas-migrate-diff add_map_infrastructure`
  - Review generated migration
  - Run `./scripts/atlas-migrate-hash --yes`
  - Apply with `supabase migration up`

### Day 3-4: Core SQL Functions
- **Morning**: Update `add_step` function
  - Add step_type and queue parameters
  - Test parameter storage
- **Afternoon**: Update `start_ready_steps` function
  - Implement dynamic task generation
  - Add empty array auto-completion
  - Test task counting logic

### Day 5-6: Task Execution Functions
- **Morning**: Update `start_tasks` function
  - Implement map input construction
  - Add queue-based filtering
  - Test element extraction
- **Afternoon**: Update `complete_task` function
  - Implement result aggregation
  - Add task count propagation
  - Test invariant maintenance

### Day 7: Comprehensive Testing
- **Morning**: SQL function testing
  - Create all new test files
  - Run comprehensive test suite
  - Validate invariant compliance
- **Afternoon**: Integration validation
  - End-to-end workflow testing
  - Performance validation
  - Error scenario testing

## Success Criteria

### Functional Requirements
1. ✅ **Map Step Creation**: `add_step` accepts `step_type='map'` parameter
2. ✅ **Dynamic Task Spawning**: Map steps spawn N tasks based on array length
3. ✅ **Empty Array Handling**: Zero-length arrays auto-complete with `[]` output
4. ✅ **Result Aggregation**: Task outputs aggregated in task_index order
5. ✅ **Task Count Propagation**: Map dependents get correct task counts
6. ✅ **Queue Infrastructure**: Queue columns added (unused until Phase 3)

### Data Integrity Requirements
1. ✅ **Complete Invariant Set**: All task counting constraints enforced
2. ✅ **Immutable initial_tasks**: Original task count never changes
3. ✅ **Consistent State Transitions**: Task counts maintained correctly
4. ✅ **Ordered Aggregation**: Results maintain task_index ordering

### Performance Requirements
1. ✅ **Batch Operations**: Task spawning uses efficient generate_series approach
2. ✅ **Index Optimization**: Queue indexes ready for Phase 3 performance
3. ✅ **Constraint Efficiency**: All constraints use efficient predicates

### Testing Requirements
1. ✅ **Comprehensive Coverage**: All functions have PgTAP tests
2. ✅ **Invariant Testing**: Task counting constraints thoroughly tested
3. ✅ **Edge Case Coverage**: Empty arrays, large arrays, error scenarios
4. ✅ **Integration Testing**: Multi-step workflows validated

## Risk Mitigation

### Identified Risks

**Risk 1: Task Counting Complexity**
- **Mitigation**: Comprehensive invariant testing and constraint enforcement
- **Testing**: Dedicated test files for task counting edge cases
- **Validation**: Mathematical verification of invariant relationships

**Risk 2: Performance Impact**
- **Mitigation**: Efficient SQL patterns (generate_series, batch operations)
- **Testing**: Performance validation with large arrays (1000+ elements)
- **Monitoring**: Query execution plan analysis

**Risk 3: Empty Array Edge Cases**
- **Mitigation**: Explicit auto-completion logic and dedicated testing
- **Testing**: Comprehensive empty array scenario coverage
- **Validation**: End-to-end empty array workflow testing

### Rollback Strategy

**Schema Rollback**:
```bash
cd pkgs/core

# Revert schema changes in pkgs/core/schemas/
# Then generate rollback migration
./scripts/atlas-migrate-diff rollback_map_infrastructure
./scripts/atlas-migrate-hash --yes
supabase migration up
```

**Function Rollback**: Revert to Phase 1 function versions using git history.

## Phase 2b Preparation

This Phase 2a implementation provides the complete SQL Core foundation for Phase 2b:

**Ready for DSL Integration**:
- Map step creation via `add_step` function
- Task spawning and completion infrastructure
- Result aggregation and ordering
- Queue parameter infrastructure (silent)

**Phase 2b Dependencies Met**:
- All SQL functions support map step workflow
- Task counting infrastructure validated
- Error scenarios handled appropriately
- Performance characteristics established

The SQL Core is now ready for DSL `.map()` method implementation and compileFlow integration in Phase 2b.

# Phase 4 Implementation Plan: Map Step Type with Parallel Processing

## Overview

Phase 4 represents the capstone implementation of pgflow's MVP, delivering the core value proposition of parallel processing through map steps with fanout capabilities. This phase implements the most complex changes across all system layers, building upon the infrastructure established in Phases 1-3.

### Complexity Analysis

**HIGH RISK - Most Complex Implementation**
- **Schema Changes**: Major structural updates to support multiple tasks per step
- **SQL Functions**: Complex logic for dynamic task spawning and result aggregation 
- **DSL Implementation**: Advanced type system for array element inference
- **Worker Integration**: Handling individual array elements vs full arrays

### Core Value Delivered

Map steps enable parallel processing by:
1. Spawning N tasks based on array dependency length
2. Distributing individual array elements to each task
3. Processing elements in parallel across worker queues
4. Aggregating results back into ordered arrays

### Dependencies

**Builds On All Previous Phases:**
- Phase 1: `.array()` DSL method for type-safe array creation
- Phase 2: `queue=false` support for manual completion  
- Phase 3: Queue routing infrastructure for worker distribution

## Database Schema Changes

### 1. Enable Map Step Type

**Current Constraint:** `step_type` limited to `'single'` only

**Required Changes:**
```sql
-- Migration: Enable map step type
ALTER TABLE pgflow.steps 
  DROP CONSTRAINT steps_step_type_check;

ALTER TABLE pgflow.steps 
  ADD CONSTRAINT steps_step_type_check 
  CHECK (step_type IN ('single', 'map'));
```

### 2. Remove Single Task Constraint

**Current Constraint:** `only_single_task_per_step check (task_index = 0)`

**Impact:** Blocks map steps from spawning multiple tasks

**Required Changes:**
```sql
-- Migration: Allow multiple tasks per step for map fanout
ALTER TABLE pgflow.step_tasks 
  DROP CONSTRAINT only_single_task_per_step;
```

### 3. Add Task Counting Columns

**Purpose:** Track task counts for map step progress and result aggregation

**Required Schema Updates:**
```sql
-- Add task counting columns to step_states
ALTER TABLE pgflow.step_states 
  ADD COLUMN initial_tasks INT NOT NULL DEFAULT 1 CHECK (initial_tasks >= 0),
  ADD COLUMN total_tasks INT NOT NULL DEFAULT 1 CHECK (total_tasks >= 0);

-- Comprehensive integrity constraints
ALTER TABLE pgflow.step_states
  ADD CONSTRAINT total_tasks_gte_initial CHECK (total_tasks >= initial_tasks),
  ADD CONSTRAINT total_tasks_gte_remaining CHECK (total_tasks >= remaining_tasks),
  ADD CONSTRAINT initial_tasks_gte_zero CHECK (initial_tasks >= 0),
  ADD CONSTRAINT remaining_tasks_gte_zero CHECK (remaining_tasks >= 0);
```

**Column Semantics:**
- `initial_tasks`: Original task count from array (immutable audit trail)
- `total_tasks`: Current total task count (for MVP, equals initial_tasks)  
- `remaining_tasks`: Tasks not yet completed (decrements as tasks finish)

**Future Extensibility:** Schema supports task appending for advanced features

### 4. Update add_step Function Signature

**Current:** No step_type parameter, defaults to 'single'

**Required Changes:**
```sql
CREATE OR REPLACE FUNCTION pgflow.add_step(
  flow_slug TEXT,
  step_slug TEXT, 
  step_type TEXT DEFAULT 'single',  -- NEW
  deps_slugs TEXT[] DEFAULT '{}',
  queue TEXT DEFAULT NULL,          -- From Phase 3
  max_attempts INT DEFAULT NULL,
  base_delay INT DEFAULT NULL,
  timeout INT DEFAULT NULL,
  start_delay INT DEFAULT NULL
)
RETURNS pgflow.steps
```

## SQL Function Major Updates

### 1. start_ready_steps Function - Dynamic Task Spawning

**Current Behavior:** Always spawns exactly 1 task per step

**New Behavior:** Dynamic task count based on step_type and array dependency

**Key Changes:**

```sql
CREATE OR REPLACE FUNCTION pgflow.start_ready_steps(run_id UUID)
RETURNS VOID
LANGUAGE SQL AS $$

WITH ready_steps AS (
  -- Find steps ready to start (unchanged logic)
  SELECT step_state.*
  FROM pgflow.step_states AS step_state
  WHERE step_state.run_id = start_ready_steps.run_id
    AND step_state.status = 'created'
    AND step_state.remaining_deps = 0
  FOR UPDATE
),
step_task_counts AS (
  -- NEW: Calculate task counts based on step type
  SELECT 
    ready_step.*,
    CASE 
      WHEN step.step_type = 'map' THEN
        -- Count elements in array dependency
        COALESCE(
          (SELECT jsonb_array_length(dep_state.output) 
           FROM pgflow.step_states dep_state
           WHERE dep_state.run_id = ready_step.run_id
             AND dep_state.step_slug IN (
               SELECT dep_slug FROM pgflow.deps 
               WHERE flow_slug = ready_step.flow_slug 
                 AND step_slug = ready_step.step_slug
               LIMIT 1
             )
           LIMIT 1
          ), 
          0
        )
      ELSE 
        1  -- Single steps always spawn 1 task
    END AS task_count
  FROM ready_steps ready_step
  JOIN pgflow.steps step ON step.flow_slug = ready_step.flow_slug 
    AND step.step_slug = ready_step.step_slug
),
updated_step_states AS (
  -- NEW: Update step_states with task counts and handle empty arrays
  UPDATE pgflow.step_states
  SET 
    status = CASE 
      WHEN counts.task_count = 0 THEN 'completed'  -- Auto-complete empty arrays
      ELSE 'started'
    END,
    started_at = CASE WHEN counts.task_count > 0 THEN now() ELSE NULL END,
    completed_at = CASE WHEN counts.task_count = 0 THEN now() ELSE NULL END,
    initial_tasks = counts.task_count,
    total_tasks = counts.task_count,
    remaining_tasks = counts.task_count,
    output = CASE WHEN counts.task_count = 0 THEN '[]'::jsonb ELSE NULL END
  FROM step_task_counts counts
  WHERE pgflow.step_states.run_id = counts.run_id
    AND pgflow.step_states.step_slug = counts.step_slug
  RETURNING pgflow.step_states.*, counts.task_count
),
generated_tasks AS (
  -- NEW: Generate multiple tasks for map steps using generate_series
  SELECT 
    updated_step.flow_slug,
    updated_step.run_id,
    updated_step.step_slug,
    task_indexes.task_index,
    step.queue
  FROM updated_step_states updated_step
  JOIN pgflow.steps step ON step.flow_slug = updated_step.flow_slug 
    AND step.step_slug = updated_step.step_slug
  CROSS JOIN generate_series(0, updated_step.task_count - 1) AS task_indexes(task_index)
  WHERE updated_step.task_count > 0  -- Only generate tasks for non-empty arrays
),
sent_messages AS (
  -- NEW: Queue routing aware message sending
  SELECT
    generated_task.*,
    CASE 
      WHEN generated_task.queue IS NULL OR generated_task.queue = '' THEN
        -- Default queue behavior (use flow_slug)
        pgmq.send(
          generated_task.flow_slug,
          jsonb_build_object(
            'flow_slug', generated_task.flow_slug,
            'run_id', generated_task.run_id, 
            'step_slug', generated_task.step_slug,
            'task_index', generated_task.task_index
          ),
          COALESCE(step.opt_start_delay, 0)
        )
      WHEN generated_task.queue = 'false' THEN
        -- Manual completion (no message sent)
        NULL
      ELSE
        -- Route to specific queue
        pgmq.send(
          generated_task.queue,
          jsonb_build_object(
            'flow_slug', generated_task.flow_slug,
            'run_id', generated_task.run_id,
            'step_slug', generated_task.step_slug, 
            'task_index', generated_task.task_index
          ),
          COALESCE(step.opt_start_delay, 0)
        )
    END AS msg_id
  FROM generated_tasks generated_task
  JOIN pgflow.steps step ON step.flow_slug = generated_task.flow_slug 
    AND step.step_slug = generated_task.step_slug
)
INSERT INTO pgflow.step_tasks (
  flow_slug, run_id, step_slug, task_index, message_id, queue,
  status
)
SELECT
  sent_msg.flow_slug,
  sent_msg.run_id,
  sent_msg.step_slug,
  sent_msg.task_index,
  sent_msg.msg_id,
  sent_msg.queue,
  CASE 
    WHEN sent_msg.queue = 'false' THEN 'started'  -- Manual tasks start immediately
    ELSE 'queued'  -- Queued tasks wait for workers
  END
FROM sent_messages sent_msg;

$$;
```

### 2. complete_task Function - Result Aggregation

**Current Behavior:** Simple output storage, decrements remaining_tasks

**New Behavior:** Array result aggregation for map steps, dependency task count propagation

**Key Changes:**

```sql
CREATE OR REPLACE FUNCTION pgflow.complete_task(
  task_run_id UUID,
  task_step_slug TEXT,
  task_index INT,
  task_output JSONB
)
RETURNS VOID
LANGUAGE SQL AS $$

WITH completed_task AS (
  -- Mark the individual task as completed
  UPDATE pgflow.step_tasks
  SET 
    status = 'completed',
    output = task_output,
    completed_at = now()
  WHERE run_id = task_run_id
    AND step_slug = task_step_slug
    AND task_index = complete_task.task_index
    AND status = 'started'
  RETURNING *
),
updated_step_state AS (
  -- Update step state and handle completion
  UPDATE pgflow.step_states
  SET remaining_tasks = remaining_tasks - 1
  WHERE run_id = task_run_id
    AND step_slug = task_step_slug
  RETURNING *
),
completed_steps AS (
  -- Handle step completion when all tasks done
  UPDATE pgflow.step_states step_state
  SET 
    status = 'completed',
    completed_at = now(),
    output = (
      -- NEW: Aggregate results for map steps, preserve order by task_index
      SELECT jsonb_agg(task.output ORDER BY task.task_index)
      FROM pgflow.step_tasks task
      WHERE task.run_id = step_state.run_id
        AND task.step_slug = step_state.step_slug
        AND task.status = 'completed'
    )
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
    END,
    remaining_deps = remaining_deps - 1
  FROM completed_steps completed_step
  JOIN pgflow.deps dep ON dep.flow_slug = completed_step.flow_slug
    AND dep.dep_slug = completed_step.step_slug
  JOIN pgflow.steps dependent_step ON dependent_step.flow_slug = dep.flow_slug
    AND dependent_step.step_slug = dep.step_slug
  WHERE dependent_state.run_id = completed_step.run_id
    AND dependent_state.step_slug = dep.step_slug
  RETURNING dependent_state.*
)
SELECT 1;

$$;
```

### 3. start_tasks Function - Map-Aware Input Construction

**Current Behavior:** Constructs input from run + all dependencies

**New Behavior:** For map steps, extract individual array element at task_index

**Key Changes:**

```sql
CREATE OR REPLACE FUNCTION pgflow.start_tasks(
  queue_name TEXT,  -- Changed from flow_slug for queue routing
  batch_size INT DEFAULT 10
)
RETURNS TABLE(
  msg_id BIGINT,
  run_id UUID,
  step_slug TEXT,
  task_index INT,
  input JSONB
)
LANGUAGE SQL AS $$

WITH polled_messages AS (
  SELECT * FROM pgmq.read_with_poll(queue_name, batch_size, 30)
),
started_tasks AS (
  UPDATE pgflow.step_tasks task
  SET 
    status = 'started',
    started_at = now(),
    attempts_count = attempts_count + 1
  FROM polled_messages msg
  WHERE task.message_id = msg.msg_id
    AND task.status = 'queued'
  RETURNING task.*
),
task_inputs AS (
  -- NEW: Map-aware input construction
  SELECT 
    task.message_id AS msg_id,
    task.run_id,
    task.step_slug,
    task.task_index,
    CASE 
      WHEN step.step_type = 'map' THEN
        -- Extract individual array element for map tasks
        COALESCE(
          (WITH deps_output AS (
            SELECT jsonb_object_agg(
              dep_state.step_slug, 
              dep_state.output
            ) AS deps
            FROM pgflow.step_states dep_state
            JOIN pgflow.deps dep ON dep.flow_slug = task.flow_slug
              AND dep.dep_slug = dep_state.step_slug
              AND dep.step_slug = task.step_slug
            WHERE dep_state.run_id = task.run_id
              AND dep_state.status = 'completed'
          )
          SELECT 
            jsonb_build_object('run', run.input) ||
            -- Extract element at task_index from the single array dependency
            (SELECT jsonb_build_object(
              key, 
              value->task.task_index
            ) FROM jsonb_each(deps.deps) LIMIT 1)
          FROM deps_output deps
          CROSS JOIN pgflow.runs run 
          WHERE run.run_id = task.run_id
          ),
          '{}'::jsonb
        )
      ELSE
        -- Standard input construction for single steps
        COALESCE(
          (WITH deps_output AS (
            SELECT jsonb_object_agg(
              dep_state.step_slug,
              dep_state.output  
            ) AS deps
            FROM pgflow.step_states dep_state
            JOIN pgflow.deps dep ON dep.flow_slug = task.flow_slug
              AND dep.dep_slug = dep_state.step_slug
              AND dep.step_slug = task.step_slug
            WHERE dep_state.run_id = task.run_id
              AND dep_state.status = 'completed'
          )
          SELECT 
            jsonb_build_object('run', run.input) || 
            COALESCE(deps.deps, '{}'::jsonb)
          FROM deps_output deps
          CROSS JOIN pgflow.runs run
          WHERE run.run_id = task.run_id
          ),
          '{}'::jsonb
        )
    END AS input
  FROM started_tasks task
  JOIN pgflow.steps step ON step.flow_slug = task.flow_slug
    AND step.step_slug = task.step_slug
)
SELECT * FROM task_inputs;

$$;
```

## DSL .map() Method Implementation

### 1. Complex Type System Requirements

**Challenge:** Extract element type from array dependency and enforce type safety

**Required Type Utilities:**
```typescript
// Extract element type from array step output
type ArrayElementType<T> = T extends Array<infer U> ? U : never;

// Map step options with array reference validation
interface MapStepOptions<
  Slug extends string, 
  ArraySlug extends string
> extends StepRuntimeOptions {
  slug: Slug;
  array: ArraySlug;  // Must reference existing array step
  queue?: string | false;  // Queue routing from Phase 3
  // Note: dependsOn automatically inferred from array parameter
}

// Map handler constraint - receives individual elements
type MapHandler<TElement, TContext> = (
  element: TElement,
  context: TContext
) => any;
```

### 2. Method Implementation

**File:** `/pkgs/dsl/src/dsl.ts`

```typescript
/**
 * Creates a map step that spawns parallel tasks to process each element 
 * of an array dependency individually
 */
map<
  Slug extends string,
  ArraySlug extends Extract<keyof Steps, string>,
  TElement = ArrayElementType<Steps[ArraySlug]>,
  THandler extends MapHandler<TElement, BaseContext & TContext>
>(
  opts: Simplify<MapStepOptions<Slug, ArraySlug>>,
  handler: THandler
): Flow<
  TFlowInput,
  TContext & BaseContext & ExtractHandlerContext<THandler>,
  Steps & { [K in Slug]: Array<AwaitedReturn<THandler>> },
  StepDependencies & { [K in Slug]: [ArraySlug] }
> {
  // Validation
  validateSlug(opts.slug);
  validateRuntimeOptions(opts, { optional: true });
  
  // Ensure array dependency exists
  if (!(opts.array in this.steps)) {
    throw new Error(`Array dependency '${opts.array}' not found. Map steps must reference an existing array step.`);
  }

  // Create step definition with automatic dependency on array step
  const stepDef: StepDefinition<THandler> = {
    handler,
    dependencies: [opts.array],  // Automatic dependency
    options: extractRuntimeOptions(opts)
  };

  // Return new flow with map step added
  return new Flow(
    this.flowOptions,
    { ...this.steps, [opts.slug]: stepDef } as Steps & { [K in Slug]: StepDefinition<THandler> },
    { ...this.stepDependencies, [opts.slug]: [opts.array] } as StepDependencies & { [K in Slug]: [ArraySlug] }
  );
}
```

### 3. Compilation Integration

**Integration with add_step function:**

```typescript
// In Flow.compile() method
for (const [stepSlug, stepDef] of Object.entries(this.steps)) {
  const isMapStep = this.isMapStep(stepSlug);
  
  await client.query(
    'SELECT pgflow.add_step($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [
      this.flowOptions.slug,
      stepSlug,
      isMapStep ? 'map' : 'single',  // step_type
      stepDef.dependencies || [],
      stepDef.options?.queue || null,
      stepDef.options?.maxAttempts,
      stepDef.options?.baseDelay,
      stepDef.options?.timeout,
      stepDef.options?.startDelay
    ]
  );
}

private isMapStep(stepSlug: string): boolean {
  // Check if step was created via .map() method
  // Implementation depends on how we track step creation method
  return this.mapSteps?.has(stepSlug) || false;
}
```

## Edge Worker Enhancements

### 1. Input Processing Updates

**Current:** Worker receives full dependency outputs

**New:** For map tasks, worker receives individual array elements

**Implementation in StepTaskExecutor.ts:**

```typescript
async execute(): Promise<void> {
  try {
    const stepSlug = this.stepTask.step_slug;
    const stepDef = this.flow.getStepDefinition(stepSlug);
    
    if (!stepDef) {
      throw new Error(`No step definition found for slug=${stepSlug}`);
    }

    // Input is already constructed correctly by start_tasks function
    // For map tasks: individual array element + run context
    // For single tasks: full dependencies + run context
    const result = await stepDef.handler(this.stepTask.input, this.context);
    
    await this.adapter.completeTask(this.stepTask, result);
  } catch (error) {
    await this.handleExecutionError(error);
  }
}
```

### 2. Queue Routing Integration

**Worker Configuration:**

```typescript
// Workers can poll multiple queues including specific map queues
const worker = new PgflowWorker({
  queues: ['default', 'email_worker', 'data_processor'],
  flow: myFlow,
  handlers: stepHandlers
});

// Worker automatically handles both single and map tasks
await worker.start();
```

### 3. Result Handling

**No Changes Required:** Workers continue to call `completeTask()` with individual results. The SQL layer handles aggregation automatically.

## Testing Strategy

### 1. Schema Migration Tests

**File:** `pkgs/core/supabase/tests/migrations/phase4.sql`

```sql
BEGIN;
  -- Test step_type='map' support
  INSERT INTO pgflow.flows (flow_slug) VALUES ('test_map_flow');
  INSERT INTO pgflow.steps (flow_slug, step_slug, step_type) 
    VALUES ('test_map_flow', 'map_step', 'map');
  
  -- Test multiple tasks per step
  INSERT INTO pgflow.runs (run_id, flow_slug, input) 
    VALUES (gen_random_uuid(), 'test_map_flow', '{}'::jsonb);
    
  -- Test task counting columns constraints
  INSERT INTO pgflow.step_states (
    flow_slug, run_id, step_slug, 
    initial_tasks, total_tasks, remaining_tasks
  ) VALUES (
    'test_map_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'map_step',
    5, 5, 3
  );
  
  -- Verify constraints work
  SELECT 
    initial_tasks, 
    total_tasks, 
    remaining_tasks 
  FROM pgflow.step_states 
  WHERE step_slug = 'map_step';
  
ROLLBACK;
```

### 2. SQL Function Integration Tests

**Test Dynamic Task Spawning:**

```sql
-- Test array with 3 elements spawns 3 tasks
WITH test_run AS (
  SELECT pgflow.start_flow('test_flow', '{"items": [1,2,3]}'::jsonb) as run_id
)
SELECT COUNT(*) as task_count
FROM pgflow.step_tasks task, test_run
WHERE task.run_id = test_run.run_id
  AND task.step_slug = 'process_items';
-- Expected: 3 tasks created

-- Test empty array auto-completion  
WITH test_run AS (
  SELECT pgflow.start_flow('test_flow', '{"items": []}'::jsonb) as run_id
)
SELECT status, output
FROM pgflow.step_states state, test_run  
WHERE state.run_id = test_run.run_id
  AND state.step_slug = 'process_items';
-- Expected: status='completed', output='[]'
```

### 3. DSL Type Safety Tests

**File:** `pkgs/dsl/__tests__/types/map-method.test-d.ts`

```typescript
import { Flow, type StepOutput } from '../../src/index.js';
import { describe, it, expectTypeOf } from 'vitest';

describe('.map() type constraints', () => {
  it('should extract array element types correctly', () => {
    const flow = new Flow<{}>({ slug: 'test' })
      .array({ slug: 'numbers' }, () => [1, 2, 3])
      .map({ slug: 'doubled', array: 'numbers' }, (num) => {
        expectTypeOf(num).toMatchTypeOf<number>();
        return num * 2;
      });
      
    type DoubledOutput = StepOutput<typeof flow, 'doubled'>;
    expectTypeOf<DoubledOutput>().toMatchTypeOf<number[]>();
  });

  it('should enforce array dependency exists', () => {
    const flow = new Flow<{}>({ slug: 'test' });
    
    // @ts-expect-error - should reject non-existent array reference
    flow.map({ slug: 'invalid', array: 'nonexistent' }, (x) => x);
  });

  it('should handle complex nested types', () => {
    type User = { id: number; name: string };
    
    const flow = new Flow<{}>({ slug: 'test' })
      .array({ slug: 'users' }, (): User[] => [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ])
      .map({ slug: 'user_emails', array: 'users' }, (user) => {
        expectTypeOf(user).toMatchTypeOf<User>();
        return `${user.name}@example.com`;
      });
      
    type EmailsOutput = StepOutput<typeof flow, 'user_emails'>;
    expectTypeOf<EmailsOutput>().toMatchTypeOf<string[]>();
  });
});
```

### 4. End-to-End Integration Tests

**File:** `pkgs/edge-worker/tests/integration/map-parallel-processing.test.ts`

```typescript
describe('Map Step Parallel Processing', () => {
  it('processes array elements in parallel', async () => {
    const flow = new Flow<{ count: number }>({ slug: 'parallel_test' })
      .array({ slug: 'items' }, ({ run }) => 
        Array(run.count).fill(0).map((_, i) => ({ id: i, value: i * 10 }))
      )
      .map({ 
        slug: 'processed', 
        array: 'items',
        queue: 'test_worker'
      }, async (item) => {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ...item, processed: true, doubled: item.value * 2 };
      });

    await flow.compile(client);
    
    const runId = await client.query(
      `SELECT pgflow.start_flow('parallel_test', '{"count": 5}'::jsonb) as run_id`
    );
    
    // Start worker to process tasks
    const worker = createFlowWorker({ flow, queues: ['test_worker'] });
    const workerPromise = worker.start();
    
    // Wait for completion
    await waitForRunCompletion(runId);
    await worker.stop();
    
    // Verify results
    const result = await client.query(
      'SELECT output FROM pgflow.step_states WHERE run_id = $1 AND step_slug = $2',
      [runId, 'processed']
    );
    
    const processedItems = result.rows[0].output;
    expect(processedItems).toHaveLength(5);
    expect(processedItems[0]).toMatchObject({ 
      id: 0, value: 0, processed: true, doubled: 0 
    });
    expect(processedItems[4]).toMatchObject({ 
      id: 4, value: 40, processed: true, doubled: 80 
    });
  });

  it('handles empty arrays gracefully', async () => {
    const flow = new Flow<{}>({ slug: 'empty_test' })
      .array({ slug: 'empty_items' }, () => [])
      .map({ slug: 'processed_empty', array: 'empty_items' }, (item) => item);

    await flow.compile(client);
    
    const runId = await client.query(
      `SELECT pgflow.start_flow('empty_test', '{}'::jsonb) as run_id`
    );
    
    // No worker needed - should auto-complete
    await waitForRunCompletion(runId);
    
    const result = await client.query(
      'SELECT status, output FROM pgflow.step_states WHERE run_id = $1 AND step_slug = $2',
      [runId, 'processed_empty']  
    );
    
    expect(result.rows[0]).toMatchObject({
      status: 'completed',
      output: []
    });
  });
});
```

### 5. Performance Testing

**Large-Scale Fanout Test:**

```typescript
it('handles large array fanout efficiently', async () => {
  const LARGE_ARRAY_SIZE = 1000;
  
  const flow = new Flow<{}>({ slug: 'large_fanout' })
    .array({ slug: 'large_array' }, () => 
      Array(LARGE_ARRAY_SIZE).fill(0).map((_, i) => i)
    )
    .map({ 
      slug: 'processed_large', 
      array: 'large_array',
      queue: 'high_throughput' 
    }, (num) => num * 2);

  const startTime = Date.now();
  
  // Process with multiple workers for parallelism
  const workers = Array(5).fill(0).map(() => 
    createFlowWorker({ flow, queues: ['high_throughput'] })
  );
  
  const workerPromises = workers.map(w => w.start());
  
  const runId = await client.query(
    `SELECT pgflow.start_flow('large_fanout', '{}'::jsonb) as run_id`
  );
  
  await waitForRunCompletion(runId);
  
  await Promise.all(workers.map(w => w.stop()));
  
  const duration = Date.now() - startTime;
  const result = await client.query(
    'SELECT output FROM pgflow.step_states WHERE run_id = $1 AND step_slug = $2',
    [runId, 'processed_large']
  );
  
  expect(result.rows[0].output).toHaveLength(LARGE_ARRAY_SIZE);
  expect(duration).toBeLessThan(30000); // Complete within 30 seconds
  
  // Verify results are in correct order
  const outputs = result.rows[0].output;
  for (let i = 0; i < LARGE_ARRAY_SIZE; i++) {
    expect(outputs[i]).toBe(i * 2);
  }
});
```

## Implementation Steps - Day-by-Day Breakdown

### Day 1: Schema Changes and Migrations

**Morning:**
- [ ] Create migration files for step_type='map' support
- [ ] Add task counting columns (initial_tasks, total_tasks)  
- [ ] Remove single task constraint
- [ ] Update add_step function signature

**Afternoon:**
- [ ] Test all schema migrations in isolation
- [ ] Verify constraint behavior with edge cases
- [ ] Test migration rollback procedures
- [ ] Document schema changes

### Day 2: SQL Function Updates - Part 1

**Morning:**
- [ ] Implement dynamic task spawning in start_ready_steps
- [ ] Add empty array auto-completion logic
- [ ] Test task generation with various array sizes

**Afternoon:** 
- [ ] Implement queue routing awareness
- [ ] Test integration with Phase 3 queue infrastructure  
- [ ] Create SQL unit tests for task spawning logic

### Day 3: SQL Function Updates - Part 2

**Morning:**
- [ ] Implement result aggregation in complete_task
- [ ] Add dependency task count propagation
- [ ] Test result ordering and array reconstruction

**Afternoon:**
- [ ] Implement map-aware input construction in start_tasks
- [ ] Test array element extraction at task_index
- [ ] Integration testing across all SQL functions

### Day 4: DSL Implementation

**Morning:**
- [ ] Implement complex type system for array element inference
- [ ] Add MapStepOptions interface and validation
- [ ] Create .map() method with proper constraints

**Afternoon:**
- [ ] Integrate with Flow compilation system
- [ ] Test TypeScript type enforcement
- [ ] Create comprehensive type-level tests

### Day 5: Worker Integration and Testing

**Morning:**
- [ ] Test worker handling of individual array elements
- [ ] Verify queue routing with map steps
- [ ] Test result completion and aggregation

**Afternoon:**
- [ ] End-to-end integration testing
- [ ] Performance testing with large arrays  
- [ ] Edge case testing (empty arrays, single elements)

### Day 6: Documentation and Polish

**Morning:**
- [ ] Create Phase 4 documentation
- [ ] Update examples and usage patterns
- [ ] Performance optimization review

**Afternoon:**
- [ ] Final integration testing
- [ ] Rollback procedure testing
- [ ] Prepare for production deployment

### Day 7: Deployment and Monitoring

**Morning:**
- [ ] Production deployment with monitoring
- [ ] Smoke testing in production environment
- [ ] Performance monitoring setup

**Afternoon:**
- [ ] User acceptance testing
- [ ] Documentation finalization
- [ ] Phase 4 completion celebration

## Success Criteria

### Functional Requirements

1. **✅ Dynamic Task Spawning**
   - Map steps spawn N tasks based on array dependency length
   - Empty arrays auto-complete with `[]` output (0 tasks)
   - Task indexes assigned correctly (0..N-1)

2. **✅ Individual Element Processing**  
   - Each task receives `array[task_index]` as input
   - Workers process individual elements, not full arrays
   - Type safety maintained from array elements to handler inputs

3. **✅ Result Aggregation**
   - Results aggregated back into arrays ordered by task_index
   - `[task₀_output, task₁_output, ..., taskₙ₋₁_output]`
   - Empty array results handled correctly

4. **✅ Queue Routing Integration**
   - Map steps support `queue: 'worker_name'` routing
   - Integration with Phase 3 queue infrastructure
   - Manual completion with `queue: false` support

5. **✅ Type Safety**
   - Array element type inference works correctly
   - Compile-time validation of array references
   - Runtime type safety preserved throughout

### Performance Requirements

1. **✅ Large Array Support**
   - Handle 1000+ element arrays efficiently
   - Parallel processing with multiple workers
   - Complete within reasonable time bounds (< 30s for 1000 elements)

2. **✅ Database Performance**  
   - Task spawning scales linearly with array size
   - Result aggregation performs efficiently
   - Constraints and indexes support large fanouts

### Reliability Requirements

1. **✅ Empty Array Handling**
   - Zero-task scenarios complete immediately  
   - No worker tasks created for empty arrays
   - Proper `[]` output generated

2. **✅ Error Resilience**
   - Individual task failures don't break aggregation
   - Retry logic works for individual map tasks
   - Partial completion handling

3. **✅ Backward Compatibility**
   - All existing flows continue working unchanged
   - No breaking changes to DSL or SQL APIs
   - Phase 1-3 infrastructure preserved

## Risk Mitigation

### High Complexity Management

**Strategy:** Incremental implementation and testing
- Each day builds on previous day's work
- Comprehensive testing at each layer
- Rollback procedures at each milestone

**Fallback Plan:** 
- Phase 4 can be disabled by reverting migrations
- Existing single/array steps continue working  
- Map steps can be temporarily blocked via constraints

### Performance Risks

**Large Array Processing:**
- Monitor database CPU/memory usage with large fanouts
- Implement batching if needed (limit concurrent tasks)
- Queue back-pressure mechanisms

**Database Lock Contention:**
- Test concurrent map step execution
- Monitor lock wait times and deadlocks
- Optimize SQL function transaction boundaries

### Type System Complexity

**TypeScript Inference Limits:**
- Test with complex nested array types
- Provide explicit type annotations where needed
- Graceful degradation for edge cases

**Runtime Validation:**
- Array reference validation at compile time
- Input construction error handling
- Type mismatch error messages

### Integration Risks

**Worker Compatibility:**
- Ensure workers handle both single and map tasks
- Test queue routing with mixed step types  
- Backward compatibility with existing handlers

**SQL Function Coordination:**
- Test cross-function integration thoroughly
- Monitor for race conditions in parallel processing
- Verify constraint enforcement under load

## Conclusion

Phase 4 represents the culmination of pgflow's MVP implementation, delivering the core value proposition of parallel processing through map steps. The implementation touches every layer of the system but builds systematically on the infrastructure established in previous phases.

The feature-by-feature approach ensures that each increment delivers working functionality while building toward the full vision. The comprehensive testing strategy and risk mitigation plans address the inherent complexity of parallel processing systems.

Upon completion, users will have access to a robust, type-safe parallel processing system that scales from simple sequential workflows to complex fanout patterns with thousands of parallel tasks, all while maintaining pgflow's core philosophy of PostgreSQL-native execution and simplicity.

The success of Phase 4 will validate pgflow's architectural approach and position it as a compelling alternative to traditional workflow orchestration platforms for database-centric applications.
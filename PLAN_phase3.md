# Phase 3 Implementation Plan: Queue Routing Support

## Overview

Phase 3 delivers production-ready task routing capabilities by enabling workers to poll specific queues and route tasks based on step configuration. This builds directly on Phase 2's `queue=false` infrastructure and provides the foundation for specialized worker pools and horizontal scaling.

**Timeline**: Week 3  
**Risk Level**: MEDIUM - builds on Phase 2 infrastructure  
**Dependencies**: Phase 1 (.array() DSL method) and Phase 2 (queue=false support) must be completed

### Core Value Proposition

- **Worker Specialization**: Route CPU-intensive tasks to dedicated workers
- **Load Distribution**: Distribute different task types across worker pools  
- **Production Scaling**: Enable horizontal scaling through queue-specific workers
- **Fault Isolation**: Isolate different workload types for better reliability

## Database Schema Enhancements

### 1. Queue Message Uniqueness Constraint

**Purpose**: Ensure message_id uniqueness per queue to prevent cross-queue collisions

```sql
-- Add unique constraint for message_id per queue
ALTER TABLE pgflow.step_tasks 
  ADD CONSTRAINT unique_msg_per_queue 
  UNIQUE (queue, message_id) 
  WHERE message_id IS NOT NULL;
```

**Rationale**: Current schema allows duplicate message_ids across queues, which can cause polling conflicts when workers process multiple queues.

### 2. Performance Indexes for Multi-Queue Polling

**Purpose**: Optimize worker polling performance across multiple queues

```sql
-- Index for queue-specific task polling
CREATE INDEX idx_step_tasks_queue_status 
  ON pgflow.step_tasks (queue, status) 
  WHERE queue IS NOT NULL AND status = 'queued';

-- Index for queue-specific worker tracking  
CREATE INDEX idx_step_tasks_queue_worker
  ON pgflow.step_tasks (queue, last_worker_id)
  WHERE queue IS NOT NULL AND status = 'started';

-- Index for queue-specific message polling
CREATE INDEX idx_step_tasks_queue_message
  ON pgflow.step_tasks (queue, message_id)
  WHERE queue IS NOT NULL AND message_id IS NOT NULL;
```

### 3. Migration Strategy

Building on Phase 2's queue column addition:

```sql
-- Migration: 202X0X0X_phase3_queue_routing.sql

-- Add unique constraint for message_id per queue
ALTER TABLE pgflow.step_tasks 
  ADD CONSTRAINT unique_msg_per_queue 
  UNIQUE (queue, message_id) 
  WHERE message_id IS NOT NULL;

-- Add performance indexes for multi-queue operations
CREATE INDEX IF NOT EXISTS idx_step_tasks_queue_status 
  ON pgflow.step_tasks (queue, status) 
  WHERE queue IS NOT NULL AND status = 'queued';

CREATE INDEX IF NOT EXISTS idx_step_tasks_queue_worker
  ON pgflow.step_tasks (queue, last_worker_id)
  WHERE queue IS NOT NULL AND status = 'started';

CREATE INDEX IF NOT EXISTS idx_step_tasks_queue_message
  ON pgflow.step_tasks (queue, message_id)
  WHERE queue IS NOT NULL AND message_id IS NOT NULL;
```

## SQL Function Updates

### 1. Update `start_tasks` Function

**Current Limitation**: Function accepts `flow_slug` parameter, assuming single queue per flow  
**Enhancement**: Support queue-specific task filtering

```sql
CREATE OR REPLACE FUNCTION pgflow.start_tasks(
  queue_name text,  -- Changed from flow_slug to queue_name
  msg_ids bigint[],
  worker_id uuid
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
    WHERE task.queue = start_tasks.queue_name  -- Queue-specific filtering
      AND task.message_id = ANY(msg_ids)
      AND task.status = 'queued'
  ),
  -- ... rest of function remains the same
$$;
```

### 2. Update `read_with_poll` Function

**Enhancement**: Support multi-queue polling within single database call

```sql
-- Option 1: Extend current function to accept queue parameter
CREATE OR REPLACE FUNCTION pgflow.read_with_poll(
  queue_name text,  -- Make queue explicit rather than defaulting to flow_slug
  vt int DEFAULT 2,
  qty int DEFAULT 1,
  max_poll_seconds int DEFAULT 2,
  poll_interval_ms int DEFAULT 250
)
-- ... implementation remains similar but uses queue_name explicitly
```

### 3. Queue-Aware Task Creation

**Enhancement**: Modify `start_ready_steps` to respect queue configuration

```sql
-- In start_ready_steps function, update message sending logic
WITH message_sending AS (
  SELECT 
    task.run_id,
    task.step_slug,
    task.task_index,
    CASE 
      WHEN step.queue IS NOT NULL AND step.queue != 'false' THEN
        pgmq.send(step.queue, jsonb_build_object(
          'flow_slug', task.flow_slug,
          'run_id', task.run_id,
          'step_slug', task.step_slug,
          'task_index', task.task_index
        ))
      ELSE NULL
    END as message_id
  FROM new_tasks task
  JOIN pgflow.steps step ON step.flow_slug = task.flow_slug 
    AND step.step_slug = task.step_slug
)
```

## Edge Worker Changes

### 1. Multi-Queue Configuration

**Current**: Worker polls single queue (flow_slug)  
**Enhancement**: Worker polls multiple configured queues

```typescript
// New worker configuration interface
export interface PgflowWorkerConfig {
  queues: string[];           // Multiple queue names to poll
  batchSize?: number;         // Per-queue batch size
  visibilityTimeout?: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
}

// Updated worker initialization
const worker = new PgflowWorker({
  queues: ['email_worker', 'cpu_intensive', 'default'],
  batchSize: 5,
  visibilityTimeout: 30
});
```

### 2. Queue-Specific Polling Logic

**Enhancement**: Round-robin or priority-based queue polling

```typescript
// In StepTaskPoller.ts
export class StepTaskPoller<TFlow extends AnyFlow> {
  constructor(
    private readonly adapter: IPgflowClient<TFlow>,
    private readonly signal: AbortSignal,
    private readonly config: MultiQueuePollerConfig,  // Updated config type
    workerIdSupplier: Supplier<string>,
    logger: Logger
  ) {
    // ...
  }

  async poll(): Promise<StepTaskWithMessage<TFlow>[]> {
    const allTasks: StepTaskWithMessage<TFlow>[] = [];

    // Poll each configured queue
    for (const queueName of this.config.queues) {
      if (this.isAborted()) break;

      try {
        // Phase 1: Read messages from specific queue
        const messages = await this.adapter.readMessages(
          queueName,  // Queue-specific polling
          this.config.visibilityTimeout ?? 2,
          this.config.batchSize,
          this.config.maxPollSeconds,
          this.config.pollIntervalMs
        );

        if (messages.length === 0) continue;

        // Phase 2: Start tasks for this queue
        const msgIds = messages.map((msg) => msg.msg_id);
        const tasks = await this.adapter.startTasks(
          queueName,  // Pass queue name instead of flow_slug
          msgIds,
          this.getWorkerId()
        );

        // Pair tasks with messages and add to collection
        const queueTasks = this.pairTasksWithMessages(tasks, messages);
        allTasks.push(...queueTasks);

      } catch (err) {
        this.logger.error(`Error polling queue ${queueName}: ${err}`);
      }
    }

    return allTasks;
  }
}
```

### 3. Worker Routing and Load Balancing

**Enhancement**: Intelligent queue processing with load balancing

```typescript
// Queue processing strategies
export interface QueueProcessingStrategy {
  selectNextQueue(queues: string[], queueStats: Map<string, QueueStats>): string;
}

export class RoundRobinStrategy implements QueueProcessingStrategy {
  private lastQueueIndex = 0;

  selectNextQueue(queues: string[]): string {
    const queue = queues[this.lastQueueIndex % queues.length];
    this.lastQueueIndex++;
    return queue;
  }
}

export class PriorityStrategy implements QueueProcessingStrategy {
  constructor(private queuePriorities: Record<string, number>) {}

  selectNextQueue(queues: string[], queueStats: Map<string, QueueStats>): string {
    return queues
      .sort((a, b) => (this.queuePriorities[b] || 0) - (this.queuePriorities[a] || 0))
      .find(queue => queueStats.get(queue)?.pendingTasks > 0) || queues[0];
  }
}
```

### 4. Backward Compatibility

**Requirement**: Existing single-queue workers must continue working

```typescript
// Support legacy single-queue configuration
export function createPgflowWorker<TFlow extends AnyFlow>(
  config: PgflowWorkerConfig | LegacyWorkerConfig,
  flow: TFlow
): PgflowWorker<TFlow> {
  // Normalize legacy config to new format
  const normalizedConfig: PgflowWorkerConfig = 'queues' in config 
    ? config 
    : { queues: [config.queueName || flow.slug], ...config };

  return new PgflowWorker(normalizedConfig, flow);
}
```

## DSL Enhancements

### 1. Queue Name Validation

**Enhancement**: Type-safe queue name validation and routing

```typescript
// Queue configuration types
export type QueueConfig = string | false;

export interface StepOptions<TSlug extends string> {
  slug: TSlug;
  queue?: QueueConfig;      // Add queue routing option
  dependsOn?: string[];
  // ... other runtime options
}

// Queue validation
function validateQueueName(queue: QueueConfig): void {
  if (queue === false) return; // Manual completion allowed
  if (typeof queue === 'string') {
    if (queue.length === 0) {
      throw new Error('Queue name cannot be empty string');
    }
    if (!isValidSlug(queue)) {
      throw new Error(`Queue name "${queue}" must be a valid slug`);
    }
  }
}
```

### 2. Integration with Phase 1 .array() and Phase 2 queue=false

**Enhancement**: Seamless integration across all phases

```typescript
export class Flow<TFlowInput, TContext, Steps, StepDependencies> {
  // Phase 1: .array() method with queue support
  array<Slug extends string, THandler extends (...args: any[]) => Array<Json>>(
    opts: StepOptions<Slug>,
    handler: THandler
  ): Flow<...> {
    // Validate queue if specified
    if (opts.queue !== undefined) {
      validateQueueName(opts.queue);
    }
    
    // Use existing .step() implementation with array type enforcement
    return this.step(opts, handler);
  }

  // Enhanced .step() method with queue support
  step<Slug extends string, THandler extends (...args: any[]) => any>(
    opts: StepOptions<Slug>,
    handler: THandler
  ): Flow<...> {
    // Validate queue configuration
    if (opts.queue !== undefined) {
      validateQueueName(opts.queue);
    }

    // Store queue configuration in step definition
    const stepDef: StepDefinition = {
      // ... existing properties
      queue: opts.queue,
    };

    // ... rest of implementation
  }
}
```

### 3. Type Safety for Queue Names

**Enhancement**: Compile-time queue name validation

```typescript
// Queue name literal types for better type safety
export type QueueName = string & { __brand: 'QueueName' };

export function queueName(name: string): QueueName {
  validateQueueName(name);
  return name as QueueName;
}

// Usage in DSL
.step({
  slug: 'email_task',
  queue: queueName('email_worker')  // Type-safe queue names
}, async (input) => {
  // ...
})
```

## Testing Strategy

### 1. Multi-Worker Integration Tests

**Purpose**: Validate queue routing works correctly with multiple workers

```sql
-- Test: Multi-queue task routing
-- File: pkgs/core/supabase/tests/queue_routing/multi_queue_task_routing.test.sql

BEGIN;
  -- Setup: Create flow with steps using different queues
  SELECT pgflow.create_flow('multi_queue_test');
  
  SELECT pgflow.add_step('multi_queue_test', 'email_step', 'single', '{}', 'email_worker');
  SELECT pgflow.add_step('multi_queue_test', 'cpu_step', 'single', '{}', 'cpu_worker'); 
  SELECT pgflow.add_step('multi_queue_test', 'default_step', 'single', '{}', NULL);

  -- Start flow and verify tasks route to correct queues
  SELECT pgflow.start_flow('multi_queue_test', '{"test": true}');
  
  -- Verify messages sent to correct queues
  SELECT is(
    (SELECT COUNT(*) FROM pgmq.q_email_worker),
    1,
    'Email task should route to email_worker queue'
  );
  
  SELECT is(
    (SELECT COUNT(*) FROM pgmq.q_cpu_worker), 
    1,
    'CPU task should route to cpu_worker queue'
  );
  
  SELECT is(
    (SELECT COUNT(*) FROM pgmq.q_multi_queue_test),
    1, 
    'Default task should route to flow_slug queue'
  );

ROLLBACK;
```

### 2. Queue Isolation Testing  

**Purpose**: Ensure tasks from different queues don't interfere

```typescript
// Test: Queue isolation
describe('Queue Routing Isolation', () => {
  test('workers only process tasks from their configured queues', async () => {
    // Setup two workers with different queue configurations
    const emailWorker = new PgflowWorker({ 
      queues: ['email_worker'] 
    }, emailFlow);
    
    const cpuWorker = new PgflowWorker({
      queues: ['cpu_worker']
    }, cpuFlow);

    // Start flows with mixed queue tasks
    await startFlow('mixed_queue_flow', { test: true });

    // Email worker should only get email tasks
    const emailTasks = await emailWorker.poll();
    expect(emailTasks.every(t => t.task.queue === 'email_worker')).toBe(true);

    // CPU worker should only get CPU tasks  
    const cpuTasks = await cpuWorker.poll();
    expect(cpuTasks.every(t => t.task.queue === 'cpu_worker')).toBe(true);
  });
});
```

### 3. Performance Testing Under Load

**Purpose**: Validate multi-queue performance at scale

```typescript
// Test: Multi-queue performance
describe('Multi-Queue Performance', () => {
  test('handles high-throughput multi-queue routing', async () => {
    const FLOW_COUNT = 100;
    const QUEUE_COUNT = 5;
    const queues = Array.from({length: QUEUE_COUNT}, (_, i) => `worker_${i}`);
    
    // Start multiple flows with round-robin queue assignment
    for (let i = 0; i < FLOW_COUNT; i++) {
      const queueName = queues[i % QUEUE_COUNT];
      await startFlowWithQueue(`test_flow_${i}`, { test: i }, queueName);
    }

    // Create workers for each queue
    const workers = queues.map(queue => 
      new PgflowWorker({ queues: [queue] }, testFlow)
    );

    // Measure processing time
    const startTime = Date.now();
    await Promise.all(workers.map(w => w.processAvailableTasks()));
    const processingTime = Date.now() - startTime;

    expect(processingTime).toBeLessThan(10000); // < 10 seconds
  });
});
```

### 4. Cross-Queue Message Isolation Testing

**Purpose**: Verify message_id uniqueness constraints work correctly

```sql
-- Test: Message ID uniqueness per queue
-- File: pkgs/core/supabase/tests/queue_routing/message_id_uniqueness.test.sql

BEGIN;
  -- Create test data with same message_id in different queues
  INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, queue, message_id, status)
  VALUES 
    ('test_flow', gen_random_uuid(), 'step1', 'queue_a', 12345, 'queued'),
    ('test_flow', gen_random_uuid(), 'step2', 'queue_b', 12345, 'queued'); -- Same message_id, different queue

  SELECT lives_ok(
    $$ SELECT * FROM pgflow.step_tasks WHERE message_id = 12345 $$,
    'Same message_id allowed in different queues'
  );

  -- Test constraint violation in same queue
  SELECT throws_ok(
    $$ INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, queue, message_id, status)
       VALUES ('test_flow', gen_random_uuid(), 'step3', 'queue_a', 12345, 'queued') $$,
    '23505', -- unique_violation error code
    null,
    'Same message_id not allowed in same queue'
  );

ROLLBACK;
```

## Implementation Steps - Week 3 Breakdown

### Day 1-2: Database Schema and SQL Functions
- **Day 1**: 
  - Create Phase 3 migration with uniqueness constraints and indexes
  - Update `start_tasks` function for queue-specific filtering
  - Update `read_with_poll` to accept explicit queue parameter
- **Day 2**:
  - Test SQL function changes with multi-queue scenarios
  - Validate constraint behavior and index performance
  - Update existing SQL tests for queue parameter changes

### Day 3-4: Edge Worker Multi-Queue Support
- **Day 3**:
  - Update `StepTaskPoller` for multi-queue polling
  - Implement queue processing strategies (round-robin, priority)
  - Add backward compatibility for single-queue configurations
- **Day 4**:
  - Update worker initialization and configuration interfaces
  - Test multi-queue worker functionality
  - Validate worker routing and load balancing

### Day 5-6: DSL Integration and Testing
- **Day 5**:
  - Add queue parameter to step options with validation
  - Integrate queue routing with Phase 1 .array() and Phase 2 queue=false
  - Implement type safety for queue names
- **Day 6**:
  - Create comprehensive integration tests
  - Test queue isolation and cross-queue scenarios
  - Validate DSL type safety and runtime validation

### Day 7: Performance Testing and Documentation
- **Day 7**:
  - Run performance tests with multiple queues and workers
  - Test high-throughput scenarios and validate scalability
  - Document queue routing capabilities and migration guide

## Success Criteria

### Functional Requirements
- ✅ Workers can poll multiple queues simultaneously
- ✅ Tasks route to correct queues based on step configuration
- ✅ Queue isolation works correctly (no cross-queue interference)
- ✅ Backward compatibility maintained for single-queue workers
- ✅ Phase 1 .array() and Phase 2 queue=false integration works seamlessly

### Performance Requirements
- ✅ Multi-queue polling performs within 10% of single-queue performance
- ✅ Database queries scale linearly with queue count
- ✅ Worker memory usage remains constant regardless of queue count
- ✅ High-throughput scenarios (1000+ tasks) process efficiently

### Quality Requirements
- ✅ All existing tests continue passing
- ✅ New tests achieve >90% code coverage for queue routing
- ✅ Zero breaking changes to existing DSL API
- ✅ Clear error messages for queue configuration issues

## Worker Queue Constraints and Type Safety

### Type-Safe Queue Selection

Workers should only be able to poll queues that are actually used by their flow, preventing configuration errors and wasted resources.

```typescript
// Extract all queues used by a flow
type FlowQueues<TFlow extends AnyFlow> = 
  | ExtractFlowQueue<TFlow>           // Flow-level queue
  | ExtractStepQueues<TFlow>          // Step-level queues  
  | ExtractFlowSlug<TFlow>;           // Default fallback

// Enhanced worker configuration with queue constraints
interface FlowWorkerConfig<TFlow extends AnyFlow> {
  // Existing config...
  maxConcurrent?: number;
  batchSize?: number;
  
  /**
   * Queues to poll - must be subset of queues used by flow
   * If not specified, polls all queues used by the flow
   */
  queues?: Array<FlowQueues<TFlow>>;
  
  /**
   * Primary queue for this worker instance  
   * Must be one of the flow's queues
   */
  primaryQueue?: FlowQueues<TFlow>;
  
  /**
   * Queue-specific configuration
   */
  queueSettings?: {
    [K in FlowQueues<TFlow>]?: {
      visibilityTimeout?: number;
      batchSize?: number;
      priority?: number;
    };
  };
}
```

### Runtime Queue Discovery and Validation

```typescript
// Helper to extract all queues from flow definition
function getFlowQueues<TFlow extends AnyFlow>(flow: TFlow): Set<string> {
  const queues = new Set<string>();
  
  // Add flow-level queue or flow slug as default
  queues.add(flow.queue || flow.slug);
  
  // Add all step-level queue overrides
  for (const step of flow.stepOrder) {
    const stepDef = flow.getStepDefinition(step);
    if (stepDef.options.queue && stepDef.options.queue !== false) {
      queues.add(stepDef.options.queue);
    } else if (!stepDef.options.queue) {
      // Step inherits flow queue
      queues.add(flow.queue || flow.slug);
    }
    // Note: queue=false steps don't add a queue (manual completion)
  }
  
  return queues;
}

// Enhanced worker creation with queue validation
export function createFlowWorker<TFlow extends AnyFlow>(
  flow: TFlow,
  config: FlowWorkerConfig<TFlow>
): Worker {
  const availableQueues = getFlowQueues(flow);
  
  // Validate configured queues
  if (config.queues) {
    for (const queue of config.queues) {
      if (!availableQueues.has(queue)) {
        throw new Error(
          `Queue "${queue}" is not used by flow "${flow.slug}". ` +
          `Available queues: ${Array.from(availableQueues).join(', ')}`
        );
      }
    }
  } else {
    // Default: poll all queues used by the flow
    config.queues = Array.from(availableQueues);
  }
  
  // ... rest of worker creation logic
}
```

### Usage Examples

```typescript
// Flow with mixed queue settings
const DataFlow = new Flow({ 
  slug: 'data_flow',
  queue: 'data_processor'  // Flow-level default
})
  .step({ slug: 'fetch' }, fetchHandler)  // Uses 'data_processor' 
  .step({ 
    slug: 'notify',
    queue: 'email_worker'  // Step override
  }, notifyHandler)
  .step({
    slug: 'debug',
    queue: false  // Manual completion
  }, debugHandler);

// Worker polling specific queues (type-safe)
EdgeWorker.start(DataFlow, {
  queues: ['data_processor', 'email_worker'],  // ✅ Valid - both used by flow
  // queues: ['invalid_queue'],  // ❌ TypeScript error + runtime validation
  primaryQueue: 'data_processor',
  queueSettings: {
    'email_worker': {
      visibilityTimeout: 30,
      batchSize: 5
    }
  }
});

// Worker polling all flow queues (default behavior)
EdgeWorker.start(DataFlow, {
  // No queues specified - polls all: ['data_processor', 'email_worker']
  maxConcurrent: 10
});
```

### Benefits

1. **Prevents Misconfiguration**: Workers can't poll queues they shouldn't
2. **Type Safety**: Compile-time validation of queue names
3. **Resource Efficiency**: Workers only poll relevant queues
4. **Clear Errors**: Helpful error messages for invalid configurations
5. **Flexible Deployment**: Easy to create specialized worker pools

## Dependencies

### Hard Dependencies (Required)
- **Phase 1 Complete**: .array() DSL method with type safety
- **Phase 2 Complete**: queue=false support and queue column in database schema
- **pgmq Extension**: Multi-queue message passing functionality
- **Database Migrations**: Phase 2 queue columns must be deployed

### Soft Dependencies (Beneficial)
- **Monitoring/Metrics**: Queue-specific performance monitoring
- **Load Balancing**: External load balancer for worker distribution
- **Alerting**: Queue depth and processing time alerts

### Breaking Changes (None Expected)
- All changes are additive and backward compatible
- Existing single-queue workers continue working unchanged
- Default behavior remains the same (queue defaults to flow_slug)
- Phase 1 and Phase 2 functionality remains unaffected

## Risk Mitigation

### Technical Risks
1. **Database Performance**: Multi-queue queries may impact performance
   - *Mitigation*: Comprehensive indexing strategy and performance testing
2. **Worker Resource Usage**: Multiple queue polling may increase memory usage
   - *Mitigation*: Efficient polling algorithms and resource monitoring
3. **Complex Configuration**: Multi-queue setup may be confusing
   - *Mitigation*: Clear documentation and sensible defaults

### Migration Risks
1. **Schema Migration**: Adding constraints to existing data
   - *Mitigation*: Careful constraint design with WHERE clauses
2. **Worker Deployment**: Rolling updates with mixed queue configurations
   - *Mitigation*: Backward compatibility and graceful degradation

### Operational Risks
1. **Queue Management**: Many queues may be difficult to monitor
   - *Mitigation*: Queue naming conventions and monitoring tools
2. **Load Distribution**: Uneven queue processing
   - *Mitigation*: Flexible queue processing strategies

This Phase 3 implementation provides the foundation for production-scale pgflow deployments with specialized worker pools and horizontal scaling capabilities.
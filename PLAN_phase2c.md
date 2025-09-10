# Phase 2c Implementation Plan: Worker and Integration

## Overview

Phase 2c completes the parallel processing implementation by enabling worker-side execution of map tasks and comprehensive end-to-end integration testing. This phase focuses on the execution layer, ensuring that map tasks are properly handled by workers and that the complete array → map workflow functions seamlessly.

**Timeline**: 2-3 days  
**Risk Level**: LOW - minimal worker changes, building on solid Phase 2a/2b foundation  
**Dependencies**: Phase 2a (Map Infrastructure) and Phase 2b (DSL and Compilation) must be completed  
**Milestone**: Complete parallel processing workflows functional end-to-end

## Core Value Proposition

- **Worker Map Task Execution**: Workers properly handle map tasks with `{ run, item }` input structure
- **End-to-End Validation**: Complete array → map workflows tested and verified
- **Performance Validation**: Parallel processing performance characteristics established  
- **Developer Ready**: Full parallel processing capability available for production use
- **Foundation Complete**: Ready for Phase 3 queue routing activation

## Worker Implementation

### Key Insight: Minimal Worker Changes Required

The worker layer requires **minimal changes** because:
1. Workers already handle generic task execution with arbitrary input structures
2. Map tasks use the same execution pattern as regular tasks  
3. Phase 2a's SQL Core handles all orchestration complexity
4. Phase 2b's compilation produces worker-compatible handlers

### Worker Changes Overview

**What Changes**: Handler input structure validation and logging  
**What Doesn't Change**: Core polling, execution, completion logic

### Input Structure Handling

Workers need to recognize and properly handle the map task input structure:

**File**: `pkgs/edge-worker/src/core/TaskExecutor.ts`

```typescript
/**
 * Enhanced task execution to handle map task input structures
 */
export class TaskExecutor<TFlow extends AnyFlow> {
  async executeTask(
    task: StepTaskWithMessage<TFlow>, 
    context: WorkerContext
  ): Promise<TaskResult> {
    const { input, step_slug, flow_slug, task_index } = task;
    
    try {
      // Get handler for this step
      const handler = this.getStepHandler(flow_slug, step_slug);
      if (!handler) {
        throw new Error(`No handler found for step: ${step_slug}`);
      }

      // Enhanced logging for map tasks
      if (this.isMapTaskInput(input)) {
        this.logger.debug(`Executing map task for step ${step_slug}, task_index ${task_index}`, {
          flow_slug,
          step_slug, 
          task_index,
          item_type: typeof input,
          item_value: input
        });
      } else {
        this.logger.debug(`Executing regular task for step ${step_slug}`, {
          flow_slug,
          step_slug,
          input_keys: Object.keys(input)
        });
      }

      // Execute handler - input structure differs for map vs regular tasks
      // For map tasks: SQL provides just the array element, worker provides context
      // For regular tasks: SQL provides full input object, worker provides same context
      const result = await handler(input, context);
      
      // Validate result is JSON-serializable
      if (!this.isJsonSerializable(result)) {
        throw new Error(`Handler ${step_slug} returned non-JSON-serializable result`);
      }

      // TODO: Add input type validation for map tasks
      // Should validate that map task inputs are actually array elements as expected
      // For now, relying on TypeScript compile-time checks and SQL layer validation

      return {
        success: true,
        output: result,
        metadata: {
          execution_time_ms: Date.now() - task.started_at,
          task_type: this.isMapTaskInput(input) ? 'map' : 'regular'
        }
      };
      
    } catch (error) {
      this.logger.error(`Task execution failed for step ${step_slug}`, {
        flow_slug,
        step_slug,
        task_index,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          task_type: this.isMapTaskInput(input) ? 'map' : 'regular'
        }
      };
    }
  }

  /**
   * Type guard to identify map task input structure
   * For map tasks, SQL provides just the individual array element (not wrapped in object)
   */
  private isMapTaskInput(input: any): boolean {
    // Map tasks receive the raw array element directly from SQL
    // Regular tasks receive objects like { run: {...}, dep1: {...}, dep2: {...} }
    return (
      typeof input !== 'object' || 
      input === null ||
      !('run' in input)
    );
  }

  /**
   * Validate that a value can be JSON-serialized
   */
  private isJsonSerializable(value: any): boolean {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  }
}
```

### Error Handling Enhancement

Enhanced error context for map task failures:

**File**: `pkgs/edge-worker/src/core/ErrorHandler.ts`

```typescript
/**
 * Enhanced error handling with map task context
 */
export class ErrorHandler {
  formatTaskError(
    error: Error,
    task: StepTaskWithMessage<any>,
    context?: { task_type?: 'map' | 'regular' }
  ): TaskError {
    const baseError = {
      message: error.message,
      step_slug: task.step_slug,
      flow_slug: task.flow_slug,
      task_index: task.task_index,
      timestamp: new Date().toISOString()
    };

    if (context?.task_type === 'map') {
      return {
        ...baseError,
        error_type: 'map_task_execution_error',
        details: {
          task_index: task.task_index,
          input_structure: 'map_task',
          suggestion: 'Check that map handler correctly processes individual array elements'
        }
      };
    }

    return {
      ...baseError,
      error_type: 'regular_task_execution_error'
    };
  }
}
```

### Performance Monitoring

Enhanced metrics for map task execution:

**File**: `pkgs/edge-worker/src/core/MetricsCollector.ts`

```typescript
/**
 * Enhanced metrics collection for map tasks
 */
export class MetricsCollector {
  recordTaskExecution(
    step_slug: string,
    duration_ms: number,
    success: boolean,
    context: { task_type?: 'map' | 'regular'; task_index?: number }
  ): void {
    // Base metrics (existing)
    this.recordMetric('task_execution_duration_ms', duration_ms, {
      step_slug,
      success: success.toString()
    });

    // Enhanced metrics for map tasks
    if (context.task_type === 'map') {
      this.recordMetric('map_task_execution_duration_ms', duration_ms, {
        step_slug,
        success: success.toString(),
        task_index: context.task_index?.toString() || 'unknown'
      });
      
      this.incrementCounter('map_tasks_executed_total', {
        step_slug,
        success: success.toString()
      });
    } else {
      this.incrementCounter('regular_tasks_executed_total', {
        step_slug,
        success: success.toString()
      });
    }
  }
}
```

## End-to-End Integration Testing

### Comprehensive Test Strategy

End-to-end testing validates the complete parallel processing pipeline:

```
pkgs/edge-worker/tests/integration/
├── map-tasks/
│   ├── basic-map-execution.test.ts      # Basic array → map workflow
│   ├── empty-array-handling.test.ts     # Zero-task scenarios
│   ├── large-array-performance.test.ts  # Performance characteristics
│   ├── error-scenarios.test.ts          # Map task failure handling
│   └── complex-workflows.test.ts        # Multi-level map chains
├── array-map-integration/
│   ├── type-inference-validation.test.ts # Runtime type validation
│   ├── result-ordering.test.ts           # Task index ordering
│   └── dependency-chaining.test.ts       # Array → map → regular chains
└── end-to-end/
    ├── parallel-processing.test.ts       # Complete parallel workflows
    ├── mixed-step-types.test.ts          # Mixed regular/map flows
    └── performance-benchmarks.test.ts    # Performance validation
```

### Key Integration Tests

#### 1. Basic Map Execution Test

**File**: `pkgs/edge-worker/tests/integration/map-tasks/basic-map-execution.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TestDbSetup, createTestFlow } from '../helpers/test-setup.js';
import { PgflowWorker } from '../../src/core/PgflowWorker.js';
import { Flow } from '@pgflow/dsl';

describe('Basic Map Execution', () => {
  let db: TestDbSetup;
  let worker: PgflowWorker<any>;

  beforeEach(async () => {
    db = await TestDbSetup.create();
    await db.reset();
  });

  it('should execute map tasks and aggregate results correctly', async () => {
    // Define flow with array → map chain
    const flow = new Flow<{ multiplier: number }>({ slug: 'map_test_flow' })
      .array({ slug: 'numbers' }, ({ run }) => [1, 2, 3, 4].map(n => n * run.multiplier))
      .map({ slug: 'squared', array: 'numbers' }, ({ item }) => item * item);

    // Deploy flow
    await db.deployFlow(flow);
    
    // Create worker
    worker = new PgflowWorker(flow, { 
      database: db.connectionString,
      batchSize: 10 
    });

    // Start flow
    const runId = await db.startFlow('map_test_flow', { multiplier: 2 });

    // Process array step first
    await worker.processAvailableTasks();
    
    // Verify array step completed
    const arrayResult = await db.getStepResult(runId, 'numbers');
    expect(arrayResult).toEqual([2, 4, 6, 8]); // [1,2,3,4] * 2

    // Process map tasks
    await worker.processAvailableTasks();
    
    // Verify map step completed with correct aggregation
    const mapResult = await db.getStepResult(runId, 'squared');
    expect(mapResult).toEqual([4, 16, 36, 64]); // [2,4,6,8] squared

    // Verify task execution order maintained
    const tasks = await db.getStepTasks(runId, 'squared');
    expect(tasks).toHaveLength(4);
    expect(tasks.map(t => t.task_index)).toEqual([0, 1, 2, 3]);
    expect(tasks.map(t => t.output)).toEqual([4, 16, 36, 64]);
  });

  it('should handle async map tasks correctly', async () => {
    const flow = new Flow<{ delay: number }>({ slug: 'async_map_flow' })
      .array({ slug: 'items' }, () => ['A', 'B', 'C'])
      .map({ slug: 'async_processed', array: 'items' }, async ({ run, item }) => {
        // Simulate async processing
        await new Promise(resolve => setTimeout(resolve, run.delay));
        return { 
          item, 
          processed_at: Date.now(),
          delay_used: run.delay 
        };
      });

    await db.deployFlow(flow);
    worker = new PgflowWorker(flow, { database: db.connectionString });

    const runId = await db.startFlow('async_map_flow', { delay: 10 });

    // Process array step
    await worker.processAvailableTasks();
    
    // Process async map tasks
    await worker.processAvailableTasks();

    const result = await db.getStepResult(runId, 'async_processed');
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ item: 'A', delay_used: 10 });
    expect(result[1]).toMatchObject({ item: 'B', delay_used: 10 });
    expect(result[2]).toMatchObject({ item: 'C', delay_used: 10 });
    
    // Verify all items have processed_at timestamps
    expect(result.every(r => typeof r.processed_at === 'number')).toBe(true);
  });
});
```

#### 2. Empty Array Handling Test

**File**: `pkgs/edge-worker/tests/integration/map-tasks/empty-array-handling.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TestDbSetup } from '../helpers/test-setup.js';
import { PgflowWorker } from '../../src/core/PgflowWorker.js';
import { Flow } from '@pgflow/dsl';

describe('Empty Array Handling', () => {
  let db: TestDbSetup;
  let worker: PgflowWorker<any>;

  beforeEach(async () => {
    db = await TestDbSetup.create();
    await db.reset();
  });

  it('should handle empty arrays gracefully', async () => {
    const flow = new Flow<{ includeItems: boolean }>({ slug: 'empty_array_flow' })
      .array({ slug: 'conditional_items' }, ({ run }) => 
        run.includeItems ? [1, 2, 3] : []
      )
      .map({ slug: 'processed', array: 'conditional_items' }, ({ item }) => item * 10)
      .step({ slug: 'summary', dependsOn: ['processed'] }, ({ processed }) => ({
        count: processed.length,
        total: processed.reduce((sum, n) => sum + n, 0)
      }));

    await db.deployFlow(flow);
    worker = new PgflowWorker(flow, { database: db.connectionString });

    // Test with empty array
    const runId = await db.startFlow('empty_array_flow', { includeItems: false });
    
    // Process array step (creates empty array)
    await worker.processAvailableTasks();
    
    const arrayResult = await db.getStepResult(runId, 'conditional_items');
    expect(arrayResult).toEqual([]);

    // Map step should auto-complete with empty result
    const mapResult = await db.getStepResult(runId, 'processed');
    expect(mapResult).toEqual([]);

    // Verify no map tasks were created
    const mapTasks = await db.getStepTasks(runId, 'processed');
    expect(mapTasks).toHaveLength(0);

    // Process summary step
    await worker.processAvailableTasks();
    
    const summaryResult = await db.getStepResult(runId, 'summary');
    expect(summaryResult).toEqual({ count: 0, total: 0 });
  });

  it('should transition from empty to non-empty arrays in subsequent runs', async () => {
    const flow = new Flow<{ itemCount: number }>({ slug: 'variable_array_flow' })
      .array({ slug: 'items' }, ({ run }) => 
        Array(run.itemCount).fill(0).map((_, i) => i + 1)
      )
      .map({ slug: 'doubled', array: 'items' }, ({ item }) => item * 2);

    await db.deployFlow(flow);
    worker = new PgflowWorker(flow, { database: db.connectionString });

    // Test empty array case
    const emptyRun = await db.startFlow('variable_array_flow', { itemCount: 0 });
    await worker.processAvailableTasks();
    
    const emptyResult = await db.getStepResult(emptyRun, 'doubled');
    expect(emptyResult).toEqual([]);

    // Test non-empty array case
    const nonEmptyRun = await db.startFlow('variable_array_flow', { itemCount: 3 });
    await worker.processAvailableTasks();
    
    const nonEmptyResult = await db.getStepResult(nonEmptyRun, 'doubled');
    expect(nonEmptyResult).toEqual([2, 4, 6]);
  });
});
```

#### 3. Complex Workflow Integration Test

**File**: `pkgs/edge-worker/tests/integration/array-map-integration/complex-workflows.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TestDbSetup } from '../helpers/test-setup.js';
import { PgflowWorker } from '../../src/core/PgflowWorker.js';
import { Flow } from '@pgflow/dsl';

describe('Complex Workflow Integration', () => {
  let db: TestDbSetup;
  let worker: PgflowWorker<any>;

  beforeEach(async () => {
    db = await TestDbSetup.create();
    await db.reset();
  });

  it('should handle multi-level map chains correctly', async () => {
    type Input = { 
      categories: string[];
      itemsPerCategory: number;
    };

    const flow = new Flow<Input>({ slug: 'multi_level_processing' })
      // Generate category data
      .array({ slug: 'category_data' }, ({ run }) =>
        run.categories.map(category => ({
          category,
          priority: category === 'urgent' ? 1 : 2,
          itemCount: run.itemsPerCategory
        }))
      )
      // Generate items for each category (map → array)
      .map({ slug: 'category_items', array: 'category_data' }, ({ item }) =>
        Array(item.itemCount).fill(0).map((_, i) => ({
          id: `${item.category}_${i}`,
          category: item.category,
          priority: item.priority,
          index: i
        }))
      )
      // Flatten nested arrays
      .step({ slug: 'all_items', dependsOn: ['category_items'] }, ({ category_items }) =>
        category_items.flat()
      )
      // Process each individual item (regular → array → map)
      .array({ slug: 'item_array', dependsOn: ['all_items'] }, ({ all_items }) => all_items)
      .map({ slug: 'processed_items', array: 'item_array' }, ({ item }) => ({
        ...item,
        processed: true,
        score: item.index * item.priority,
        processedAt: Date.now()
      }))
      // Final aggregation
      .step({ slug: 'final_report', dependsOn: ['processed_items'] }, ({ processed_items }) => ({
        totalItems: processed_items.length,
        averageScore: processed_items.reduce((sum, item) => sum + item.score, 0) / processed_items.length,
        categoryCounts: processed_items.reduce((counts, item) => {
          counts[item.category] = (counts[item.category] || 0) + 1;
          return counts;
        }, {} as Record<string, number>),
        highPriorityCount: processed_items.filter(item => item.priority === 1).length
      }));

    await db.deployFlow(flow);
    worker = new PgflowWorker(flow, { database: db.connectionString });

    const input = { 
      categories: ['urgent', 'normal', 'low'], 
      itemsPerCategory: 2 
    };
    const runId = await db.startFlow('multi_level_processing', input);

    // Process complete workflow
    await worker.processUntilComplete();

    // Verify each stage
    const categoryData = await db.getStepResult(runId, 'category_data');
    expect(categoryData).toHaveLength(3);
    expect(categoryData[0]).toMatchObject({ category: 'urgent', priority: 1 });

    const categoryItems = await db.getStepResult(runId, 'category_items');
    expect(categoryItems).toHaveLength(3); // 3 categories
    expect(categoryItems[0]).toHaveLength(2); // 2 items per category

    const allItems = await db.getStepResult(runId, 'all_items');
    expect(allItems).toHaveLength(6); // 3 categories * 2 items

    const processedItems = await db.getStepResult(runId, 'processed_items');
    expect(processedItems).toHaveLength(6);
    expect(processedItems.every(item => item.processed === true)).toBe(true);
    expect(processedItems.every(item => typeof item.processedAt === 'number')).toBe(true);

    const finalReport = await db.getStepResult(runId, 'final_report');
    expect(finalReport).toMatchObject({
      totalItems: 6,
      categoryCounts: { urgent: 2, normal: 2, low: 2 },
      highPriorityCount: 2
    });
    expect(typeof finalReport.averageScore).toBe('number');
  });

  it('should handle diamond dependency patterns with maps', async () => {
    const flow = new Flow<{ base: number }>({ slug: 'diamond_pattern' })
      // Root data
      .step({ slug: 'root' }, ({ run }) => ({ value: run.base, factor: 10 }))
      
      // Two parallel array branches
      .array({ slug: 'left_data', dependsOn: ['root'] }, ({ root }) =>
        [1, 2, 3].map(n => ({ value: n * root.value, branch: 'left' }))
      )
      .array({ slug: 'right_data', dependsOn: ['root'] }, ({ root }) =>
        [4, 5].map(n => ({ value: n * root.value, branch: 'right' }))
      )
      
      // Parallel map processing
      .map({ slug: 'left_processed', array: 'left_data' }, ({ item, run }) => ({
        ...item,
        processed: item.value * run.factor,
        side: 'left'
      }))
      .map({ slug: 'right_processed', array: 'right_data' }, ({ item, run }) => ({
        ...item,
        processed: item.value * run.factor,
        side: 'right'
      }))
      
      // Merge results
      .step({ 
        slug: 'merged', 
        dependsOn: ['left_processed', 'right_processed'] 
      }, ({ left_processed, right_processed }) => ({
        leftItems: left_processed,
        rightItems: right_processed,
        totalItems: left_processed.length + right_processed.length,
        totalProcessed: [...left_processed, ...right_processed].reduce(
          (sum, item) => sum + item.processed, 0
        )
      }));

    await db.deployFlow(flow);
    worker = new PgflowWorker(flow, { database: db.connectionString });

    const runId = await db.startFlow('diamond_pattern', { base: 2, factor: 10 });
    await worker.processUntilComplete();

    const leftProcessed = await db.getStepResult(runId, 'left_processed');
    const rightProcessed = await db.getStepResult(runId, 'right_processed');
    const merged = await db.getStepResult(runId, 'merged');

    expect(leftProcessed).toHaveLength(3);
    expect(rightProcessed).toHaveLength(2);
    expect(leftProcessed[0]).toMatchObject({ 
      value: 2, // 1 * base(2)
      processed: 20, // value(2) * factor(10)
      side: 'left' 
    });
    expect(rightProcessed[0]).toMatchObject({ 
      value: 8, // 4 * base(2)
      processed: 80, // value(8) * factor(10)
      side: 'right' 
    });

    expect(merged).toMatchObject({
      totalItems: 5,
      totalProcessed: 300 // (2+4+6)*10 + (8+10)*10 = 120 + 180 = 300
    });
  });
});
```

#### 4. Performance Validation Test

**File**: `pkgs/edge-worker/tests/integration/end-to-end/performance-benchmarks.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TestDbSetup } from '../helpers/test-setup.js';
import { PgflowWorker } from '../../src/core/PgflowWorker.js';
import { Flow } from '@pgflow/dsl';

describe('Performance Benchmarks', () => {
  let db: TestDbSetup;
  let worker: PgflowWorker<any>;

  beforeEach(async () => {
    db = await TestDbSetup.create();
    await db.reset();
  });

  it('should handle large arrays efficiently', async () => {
    const LARGE_ARRAY_SIZE = 100; // Adjust for CI performance
    
    const flow = new Flow<{ size: number }>({ slug: 'large_array_flow' })
      .array({ slug: 'large_data' }, ({ run }) =>
        Array(run.size).fill(0).map((_, i) => ({ 
          id: i, 
          value: Math.random() * 1000,
          category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C'
        }))
      )
      .map({ slug: 'processed_data', array: 'large_data' }, ({ item }) => ({
        id: item.id,
        processedValue: item.value * 1.5,
        category: item.category,
        isEven: item.id % 2 === 0
      }))
      .step({ slug: 'summary', dependsOn: ['processed_data'] }, ({ processed_data }) => ({
        totalItems: processed_data.length,
        averageValue: processed_data.reduce((sum, item) => sum + item.processedValue, 0) / processed_data.length,
        categoryDistribution: processed_data.reduce((dist, item) => {
          dist[item.category] = (dist[item.category] || 0) + 1;
          return dist;
        }, {} as Record<string, number>),
        evenCount: processed_data.filter(item => item.isEven).length
      }));

    await db.deployFlow(flow);
    worker = new PgflowWorker(flow, { 
      database: db.connectionString,
      batchSize: 25 // Process in batches
    });

    const startTime = Date.now();
    const runId = await db.startFlow('large_array_flow', { size: LARGE_ARRAY_SIZE });
    
    await worker.processUntilComplete();
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    // Verify results
    const summary = await db.getStepResult(runId, 'summary');
    expect(summary.totalItems).toBe(LARGE_ARRAY_SIZE);
    expect(typeof summary.averageValue).toBe('number');
    expect(summary.categoryDistribution).toHaveProperty('A');
    expect(summary.categoryDistribution).toHaveProperty('B');  
    expect(summary.categoryDistribution).toHaveProperty('C');

    // Performance assertions
    console.log(`Large array processing (${LARGE_ARRAY_SIZE} items): ${totalDuration}ms`);
    expect(totalDuration).toBeLessThan(30000); // Should complete within 30 seconds

    // Verify all map tasks completed successfully
    const mapTasks = await db.getStepTasks(runId, 'processed_data');
    expect(mapTasks).toHaveLength(LARGE_ARRAY_SIZE);
    expect(mapTasks.every(task => task.status === 'completed')).toBe(true);
  });

  it('should handle concurrent map execution efficiently', async () => {
    const flow = new Flow<{ concurrency: number }>({ slug: 'concurrent_flow' })
      .array({ slug: 'work_items' }, ({ run }) =>
        Array(20).fill(0).map((_, i) => ({ id: i, workAmount: run.concurrency }))
      )
      .map({ slug: 'concurrent_work', array: 'work_items' }, async ({ item }) => {
        // Simulate CPU work
        const start = Date.now();
        while (Date.now() - start < item.workAmount) {
          // Busy wait to simulate work
          Math.random() * Math.random();
        }
        return { 
          id: item.id, 
          workDone: item.workAmount,
          completedAt: Date.now()
        };
      });

    await db.deployFlow(flow);
    worker = new PgflowWorker(flow, { 
      database: db.connectionString,
      batchSize: 10,  // Allow concurrent processing
      maxConcurrent: 5
    });

    const startTime = Date.now();
    const runId = await db.startFlow('concurrent_flow', { concurrency: 10 }); // 10ms of work per item

    await worker.processUntilComplete();
    const endTime = Date.now();

    const result = await db.getStepResult(runId, 'concurrent_work');
    expect(result).toHaveLength(20);
    
    // Verify concurrent execution (should be faster than sequential)
    const totalDuration = endTime - startTime;
    const sequentialTime = 20 * 10; // 20 items * 10ms each = 200ms minimum
    
    console.log(`Concurrent execution: ${totalDuration}ms vs sequential ${sequentialTime}ms`);
    
    // With concurrency, should complete faster than sequential
    // (allowing for overhead and test environment variability)
    expect(totalDuration).toBeLessThan(sequentialTime * 3);
    
    // Verify all tasks completed
    expect(result.every(item => typeof item.completedAt === 'number')).toBe(true);
  });
});
```

### Test Utilities Enhancement

**File**: `pkgs/edge-worker/tests/helpers/test-setup.ts`

```typescript
/**
 * Enhanced test setup utilities for map task testing
 */
export class TestDbSetup {
  /**
   * Process all available tasks until no more work remains
   */
  async processUntilComplete(maxIterations: number = 10): Promise<void> {
    let iterations = 0;
    while (iterations < maxIterations) {
      const processedCount = await this.worker.processAvailableTasks();
      if (processedCount === 0) {
        // No more tasks to process
        break;
      }
      iterations++;
    }

    if (iterations >= maxIterations) {
      throw new Error(`Workflow did not complete within ${maxIterations} iterations`);
    }
  }

  /**
   * Get all tasks for a specific step, ordered by task_index
   */
  async getStepTasks(runId: string, stepSlug: string): Promise<StepTaskRecord[]> {
    const result = await this.db.query(`
      SELECT * FROM pgflow.step_tasks 
      WHERE run_id = $1 AND step_slug = $2 
      ORDER BY task_index
    `, [runId, stepSlug]);
    
    return result.rows;
  }

  /**
   * Get step execution metrics
   */
  async getStepMetrics(runId: string, stepSlug: string): Promise<StepMetrics> {
    const tasks = await this.getStepTasks(runId, stepSlug);
    const stepState = await this.db.query(`
      SELECT * FROM pgflow.step_states 
      WHERE run_id = $1 AND step_slug = $2
    `, [runId, stepSlug]);

    return {
      taskCount: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      avgExecutionTime: tasks.length > 0 
        ? tasks.reduce((sum, t) => sum + (t.completed_at - t.started_at), 0) / tasks.length
        : 0,
      stepStatus: stepState.rows[0]?.status,
      initialTasks: stepState.rows[0]?.initial_tasks,
      totalTasks: stepState.rows[0]?.total_tasks,
      remainingTasks: stepState.rows[0]?.remaining_tasks
    };
  }
}

interface StepMetrics {
  taskCount: number;
  completedTasks: number;
  failedTasks: number;
  avgExecutionTime: number;
  stepStatus: string;
  initialTasks: number;
  totalTasks: number;
  remainingTasks: number;
}
```

## Implementation Timeline

### Day 1: Worker Implementation
- **Morning**: Implement enhanced task execution logic
  - Map task input structure recognition
  - Enhanced logging and error handling
  - Performance metrics collection
- **Afternoon**: Worker testing and validation
  - Unit tests for map task execution
  - Error handling validation
  - Performance monitoring verification

### Day 2: Integration Testing Foundation
- **Morning**: Test infrastructure setup
  - Enhanced test utilities
  - Database setup helpers
  - Worker lifecycle management
- **Afternoon**: Basic integration tests
  - Simple array → map workflows
  - Empty array handling
  - Error scenario testing

### Day 3: Comprehensive Integration Testing
- **Morning**: Complex workflow testing
  - Multi-level map chains
  - Diamond dependency patterns
  - Mixed step type workflows
- **Afternoon**: Performance validation
  - Large array processing
  - Concurrent execution testing
  - Performance benchmarking

## Success Criteria

### Worker Requirements
1. ✅ **Map Task Execution**: Workers correctly execute map tasks with `{ run, item }` input
2. ✅ **Input Structure Recognition**: Workers properly identify and handle map task inputs
3. ✅ **Error Handling**: Map task failures provide clear, actionable error messages
4. ✅ **Performance Monitoring**: Enhanced metrics for map task execution

### Integration Requirements
1. ✅ **End-to-End Workflows**: Complete array → map chains work correctly
2. ✅ **Result Aggregation**: Map results properly aggregated in task_index order
3. ✅ **Empty Array Handling**: Zero-task scenarios handled gracefully
4. ✅ **Complex Patterns**: Multi-level and diamond patterns work correctly

### Performance Requirements
1. ✅ **Large Array Support**: 100+ element arrays process efficiently
2. ✅ **Concurrent Execution**: Map tasks execute in parallel as expected
3. ✅ **Resource Efficiency**: No memory leaks or resource accumulation
4. ✅ **Reasonable Timing**: Large workflows complete within acceptable timeframes

### Quality Requirements
1. ✅ **Comprehensive Testing**: All integration scenarios covered
2. ✅ **Error Scenarios**: Failure modes tested and validated
3. ✅ **Performance Benchmarks**: Performance characteristics established
4. ✅ **Documentation**: Integration patterns documented

## Risk Mitigation

### Identified Risks

**Risk 1: Worker Compatibility Issues**
- **Mitigation**: Minimal changes to proven worker architecture
- **Testing**: Backwards compatibility testing with existing flows
- **Validation**: Both regular and map tasks in same worker instance

**Risk 2: Performance Bottlenecks**
- **Mitigation**: Comprehensive performance testing and benchmarking
- **Testing**: Large array scenarios, concurrent execution validation
- **Monitoring**: Performance metrics collection and analysis

**Risk 3: Complex Workflow Failures**
- **Mitigation**: Thorough integration testing of complex patterns
- **Testing**: Diamond patterns, multi-level chains, error propagation
- **Debugging**: Enhanced logging and error context

### Rollback Strategy

**Worker Rollback**: Revert to Phase 2b worker version (minimal changes)
**Test Rollback**: Archive integration tests for future phases
**Integration Rollback**: Phase 2a and 2b remain functional independently

## Phase 3 Preparation

This Phase 2c completion delivers the full parallel processing capability and prepares for Phase 3 queue routing:

**Ready for Queue Routing**:
- Workers handle arbitrary task structures (ready for queue-specific routing)
- Error handling provides queue-specific context
- Performance monitoring supports queue-specific metrics
- Integration testing patterns established for queue validation

**Phase 3 Integration Points**:
- Task execution logic ready for multi-queue scenarios
- Error handling supports queue-specific troubleshooting
- Performance monitoring can track queue-specific metrics
- Integration tests can validate queue isolation

**Complete Parallel Processing**:
- Array → map workflows fully functional
- Type safety from DSL through execution
- Performance characteristics established
- Developer experience validated

The complete parallel processing pipeline is now ready for production use, with Phase 3 queue routing as a scaling enhancement rather than core functionality requirement.
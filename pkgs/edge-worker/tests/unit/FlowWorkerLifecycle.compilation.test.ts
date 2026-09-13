import { assertEquals, assertRejects } from '@std/assert';
import { FlowWorkerLifecycle } from '../../src/flow/FlowWorkerLifecycle.ts';
import { Queries, type EnsureFlowCompiledResult } from '../../src/core/Queries.ts';
import type { WorkerRow } from '../../src/core/types.ts';
import { Flow, type FlowShape } from '@pgflow/dsl';
import type { Logger } from '../../src/platform/types.ts';
import type { postgres } from '../sql.ts';

// Mock Queries that records each database action in startup order
class MockQueries extends Queries {
  readonly calls: string[] = [];
  public trackWorkerFunctionCallCount = 0;
  public lastTrackedFunctionName: string | null = null;
  public lastTrackedStartMode: string | null = null;
  nextCompilationResult: EnsureFlowCompiledResult = {
    status: 'verified',
    differences: [],
  };

  constructor() {
    // Pass null as sql since we'll override all methods
    super(null as unknown as postgres.Sql);
  }

  override ensureFlowCompiled(
    _flowSlug: string,
    _shape: FlowShape
  ): Promise<EnsureFlowCompiledResult> {
    this.calls.push('compile');
    return Promise.resolve(this.nextCompilationResult);
  }

  override resolveQueueName(_canonicalQueueName: string): Promise<string | null> {
    this.calls.push('resolve-queue');
    return Promise.resolve(null); // not listed: keep the canonical name
  }

  override trackWorkerFunction(functionName: string, startMode = 'http'): Promise<void> {
    this.calls.push('track');
    this.trackWorkerFunctionCallCount++;
    this.lastTrackedFunctionName = functionName;
    this.lastTrackedStartMode = startMode;
    return Promise.resolve();
  }

  override onWorkerStarted(params: {
    workerId: string;
    edgeFunctionName: string;
    queueName: string;
  }): Promise<WorkerRow> {
    this.calls.push('worker');
    return Promise.resolve({
      worker_id: params.workerId,
      queue_name: params.queueName,
      function_name: params.edgeFunctionName,
      started_at: new Date().toISOString(),
      deprecated_at: null,
      last_heartbeat_at: new Date().toISOString(),
    });
  }

  override sendHeartbeat(_workerRow: WorkerRow): Promise<{ is_deprecated: boolean }> {
    return Promise.resolve({ is_deprecated: false });
  }
}

// Real Flow for testing - using the DSL to create a valid flow
const TestFlow = new Flow<{ value: number }>({ slug: 'test_flow' })
  .step({ slug: 'step1' }, (flowInput) => flowInput.value);

const createMockFlow = () => TestFlow;

const createLogger = (): Logger => ({
  debug: () => {},
  verbose: () => {},
  info: () => {},
  error: () => {},
  warn: () => {},
  taskStarted: () => {},
  taskCompleted: () => {},
  taskFailed: () => {},
  polling: () => {},
  taskCount: () => {},
  startupBanner: () => {},
  shutdown: () => {},
});

// ==================================================
// Tests for mandatory startup compilation
// ==================================================

Deno.test('FlowWorkerLifecycle - compiles before registration', async () => {
  const queries = new MockQueries();
  const lifecycle = new FlowWorkerLifecycle(queries, createMockFlow(), createLogger());

  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  assertEquals(queries.calls, ['compile', 'resolve-queue', 'track', 'worker']);
});

Deno.test('FlowWorkerLifecycle - compilation failure does not register', async () => {
  const queries = new MockQueries();
  queries.nextCompilationResult = {
    status: 'mismatch',
    differences: ['Step count differs: 1 vs 2'],
  };
  const lifecycle = new FlowWorkerLifecycle(queries, createMockFlow(), createLogger());

  await assertRejects(
    () =>
      lifecycle.acknowledgeStart({
        workerId: 'test-worker-id',
        edgeFunctionName: 'test-function',
      }),
    Error,
    'shape mismatch'
  );

  assertEquals(queries.calls, ['compile']);
});

Deno.test('FlowWorkerLifecycle - calls trackWorkerFunction during startup', async () => {
  const queries = new MockQueries();
  const lifecycle = new FlowWorkerLifecycle(queries, createMockFlow(), createLogger());

  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'my-edge-function',
  });

  assertEquals(queries.trackWorkerFunctionCallCount, 1, 'trackWorkerFunction should be called once');
  assertEquals(queries.lastTrackedFunctionName, 'my-edge-function', 'trackWorkerFunction should be called with correct function name');
  assertEquals(queries.lastTrackedStartMode, 'http', 'trackWorkerFunction should default start mode to http');
});

Deno.test('FlowWorkerLifecycle - passes process start mode during startup', async () => {
  const queries = new MockQueries();
  const lifecycle = new FlowWorkerLifecycle(queries, createMockFlow(), createLogger());

  const workerBootstrap = {
    workerId: 'test-worker-id',
    edgeFunctionName: 'my-edge-function',
    startMode: 'process' as const,
  };

  await lifecycle.acknowledgeStart(workerBootstrap);

  assertEquals(queries.trackWorkerFunctionCallCount, 1, 'trackWorkerFunction should be called once');
  assertEquals(queries.lastTrackedFunctionName, 'my-edge-function', 'trackWorkerFunction should be called with correct function name');
  assertEquals(queries.lastTrackedStartMode, 'process', 'trackWorkerFunction should receive process start mode');
});

import { assertEquals } from '@std/assert';
import { FlowWorkerLifecycle } from '../../src/flow/FlowWorkerLifecycle.ts';
import { Queries, type EnsureFlowCompiledResult } from '../../src/core/Queries.ts';
import type { WorkerRow } from '../../src/core/types.ts';
import { Flow, type FlowShape } from '@pgflow/dsl';
import type { Logger } from '../../src/platform/types.ts';
import type { postgres } from '../sql.ts';

// Mock Queries
class MockQueries extends Queries {
  public ensureFlowCompiledCallCount = 0;
  public trackWorkerFunctionCallCount = 0;
  public lastTrackedFunctionName: string | null = null;

  constructor() {
    // Pass null as sql since we'll override all methods
    super(null as unknown as postgres.Sql);
  }

  override onWorkerStarted(params: { workerId: string; edgeFunctionName: string; queueName: string }): Promise<WorkerRow> {
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

  override ensureFlowCompiled(
    _flowSlug: string,
    _shape: FlowShape
  ): Promise<EnsureFlowCompiledResult> {
    this.ensureFlowCompiledCallCount++;
    return Promise.resolve({ status: 'verified', differences: [] });
  }

  override trackWorkerFunction(functionName: string): Promise<void> {
    this.trackWorkerFunctionCallCount++;
    this.lastTrackedFunctionName = functionName;
    return Promise.resolve();
  }
}

// Real Flow for testing - using the DSL to create a valid flow
const TestFlow = new Flow<{ value: number }>({ slug: 'test_flow' })
  .step({ slug: 'step1' }, (input) => input.run.value);

const createMockFlow = () => TestFlow;

const createLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  error: () => {},
  warn: () => {},
});

Deno.test('FlowWorkerLifecycle - calls ensureFlowCompiled when ensureCompiledOnStartup is true', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const logger = createLogger();

  const lifecycle = new FlowWorkerLifecycle(mockQueries, mockFlow, logger, {
    ensureCompiledOnStartup: true
  });

  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  assertEquals(mockQueries.ensureFlowCompiledCallCount, 1, 'ensureFlowCompiled should be called once');
});

Deno.test('FlowWorkerLifecycle - skips ensureFlowCompiled when ensureCompiledOnStartup is false', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const logger = createLogger();

  const lifecycle = new FlowWorkerLifecycle(mockQueries, mockFlow, logger, {
    ensureCompiledOnStartup: false
  });

  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  assertEquals(mockQueries.ensureFlowCompiledCallCount, 0, 'ensureFlowCompiled should NOT be called');
});

Deno.test('FlowWorkerLifecycle - calls ensureFlowCompiled by default (no config)', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const logger = createLogger();

  const lifecycle = new FlowWorkerLifecycle(mockQueries, mockFlow, logger);

  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  assertEquals(mockQueries.ensureFlowCompiledCallCount, 1, 'ensureFlowCompiled should be called by default');
});

Deno.test('FlowWorkerLifecycle - calls ensureFlowCompiled by default (empty config)', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const logger = createLogger();

  const lifecycle = new FlowWorkerLifecycle(mockQueries, mockFlow, logger, {});

  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  assertEquals(mockQueries.ensureFlowCompiledCallCount, 1, 'ensureFlowCompiled should be called with empty config');
});

Deno.test('FlowWorkerLifecycle - logs skip message when ensureCompiledOnStartup is false', async () => {
  const logs: string[] = [];
  const testLogger: Logger = {
    debug: () => {},
    info: (msg: string) => logs.push(msg),
    error: () => {},
    warn: () => {},
  };

  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();

  const lifecycle = new FlowWorkerLifecycle(mockQueries, mockFlow, testLogger, {
    ensureCompiledOnStartup: false
  });

  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  const skipLog = logs.find(log => log.includes('Skipping compilation'));
  assertEquals(skipLog !== undefined, true, 'Should log skip message');
  assertEquals(skipLog?.includes('ensureCompiledOnStartup=false'), true, 'Skip message should mention the config flag');
});

Deno.test('FlowWorkerLifecycle - does not log skip message when ensureCompiledOnStartup is true', async () => {
  const logs: string[] = [];
  const testLogger: Logger = {
    debug: () => {},
    info: (msg: string) => logs.push(msg),
    error: () => {},
    warn: () => {},
  };

  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();

  const lifecycle = new FlowWorkerLifecycle(mockQueries, mockFlow, testLogger, {
    ensureCompiledOnStartup: true
  });

  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  const skipLog = logs.find(log => log.includes('Skipping compilation'));
  assertEquals(skipLog, undefined, 'Should NOT log skip message when compilation is enabled');
});

Deno.test('FlowWorkerLifecycle - calls trackWorkerFunction during startup', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const logger = createLogger();

  const lifecycle = new FlowWorkerLifecycle(mockQueries, mockFlow, logger);

  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'my-edge-function',
  });

  assertEquals(mockQueries.trackWorkerFunctionCallCount, 1, 'trackWorkerFunction should be called once');
  assertEquals(mockQueries.lastTrackedFunctionName, 'my-edge-function', 'trackWorkerFunction should be called with correct function name');
});

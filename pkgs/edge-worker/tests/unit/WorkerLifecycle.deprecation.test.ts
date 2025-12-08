import { assertEquals, assertThrows } from '@std/assert';
import { WorkerLifecycle } from '../../src/core/WorkerLifecycle.ts';
import { TransitionError } from '../../src/core/WorkerState.ts';
import { Queries } from '../../src/core/Queries.ts';
import { Queue } from '../../src/queue/Queue.ts';
import type { WorkerRow, Json } from '../../src/core/types.ts';
import type { Logger } from '../../src/platform/types.ts';
import { createLoggingFactory } from '../../src/platform/logging.ts';
import type { postgres } from '../sql.ts';

const loggingFactory = createLoggingFactory();
loggingFactory.setLogLevel('info');
const logger = loggingFactory.createLogger('WorkerLifecycle');


// Mock Queries
class MockQueries extends Queries {
  public sendHeartbeatCallCount = 0;
  public nextResult: { is_deprecated: boolean } = { is_deprecated: false };
  public workerStopped = false;

  constructor() {
    // Pass null as sql since we'll override all methods
    super(null as unknown as postgres.Sql);
  }

  override onWorkerStarted(params: {
    workerId: string;
    edgeFunctionName: string;
    queueName: string;
  }): Promise<WorkerRow> {
    return Promise.resolve({
      worker_id: params.workerId,
      queue_name: params.queueName,
      function_name: params.edgeFunctionName,
      started_at: new Date().toISOString(),
      deprecated_at: null,
      last_heartbeat_at: new Date().toISOString(),
    });
  }

  override sendHeartbeat(
    _workerRow: WorkerRow
  ): Promise<{ is_deprecated: boolean }> {
    this.sendHeartbeatCallCount++;
    return Promise.resolve(this.nextResult);
  }

  override onWorkerStopped(workerRow: WorkerRow): Promise<WorkerRow> {
    this.workerStopped = true;
    return Promise.resolve(workerRow);
  }

  override trackWorkerFunction(_functionName: string): Promise<void> {
    return Promise.resolve();
  }

  override markWorkerStopped(_workerId: string): Promise<void> {
    return Promise.resolve();
  }
}

// Mock Queue
class MockQueue<T extends Json> extends Queue<T> {
  constructor(queueName: string) {
    // Pass null as sql and a mock logger since we'll override safeCreate
    super(null as unknown as postgres.Sql, queueName, { debug: () => {}, info: () => {}, error: () => {}, warn: () => {} } as Logger);
  }

  override safeCreate(): Promise<postgres.RowList<postgres.Row[]>> {
    // No-op for testing - return a mock RowList
    const mockRowList = [] as postgres.Row[];
    Object.assign(mockRowList, {
      columns: [],
      count: 0,
      command: 'SELECT',
      statement: { string: '', values: [] },
      state: null
    });
    return Promise.resolve(mockRowList as postgres.RowList<postgres.Row[]>);
  }
}


Deno.test(
  'WorkerLifecycle - should transition to deprecated state when heartbeat returns is_deprecated true',
  async () => {
    const mockQueries = new MockQueries();
    const mockQueue = new MockQueue('test-queue');
    const lifecycle = new WorkerLifecycle(
      mockQueries,
      mockQueue,
      logger,
      { heartbeatInterval: 0 } // No interval for testing
    );

    // Start the worker first
    await lifecycle.acknowledgeStart({
      workerId: 'test-worker-id',
      edgeFunctionName: 'test-function',
    });

    assertEquals(lifecycle.isRunning, true);
    assertEquals(lifecycle.isDeprecated, false);

    // First heartbeat - not deprecated
    mockQueries.nextResult = { is_deprecated: false };
    await lifecycle.sendHeartbeat();

    assertEquals(lifecycle.isRunning, true);
    assertEquals(lifecycle.isDeprecated, false);
    assertEquals(mockQueries.sendHeartbeatCallCount, 1);

    // Second heartbeat - deprecated
    mockQueries.nextResult = { is_deprecated: true };
    await lifecycle.sendHeartbeat();

    assertEquals(lifecycle.isRunning, false); // Should be false now
    assertEquals(lifecycle.isDeprecated, true);
    assertEquals(mockQueries.sendHeartbeatCallCount, 2);
  }
);

Deno.test(
  'WorkerLifecycle - should only transition to deprecated once',
  async () => {
    const mockQueries = new MockQueries();
    const mockQueue = new MockQueue('test-queue');
    const lifecycle = new WorkerLifecycle(
      mockQueries,
      mockQueue,
      logger,
      { heartbeatInterval: 0 } // No interval for testing
    );

    // Start the worker
    await lifecycle.acknowledgeStart({
      workerId: 'test-worker-id',
      edgeFunctionName: 'test-function',
    });

    // First deprecated heartbeat
    mockQueries.nextResult = { is_deprecated: true };
    await lifecycle.sendHeartbeat();

    assertEquals(lifecycle.isDeprecated, true);

    // Second deprecated heartbeat - should not cause issues
    await lifecycle.sendHeartbeat();

    assertEquals(lifecycle.isDeprecated, true);
    assertEquals(mockQueries.sendHeartbeatCallCount, 2);
  }
);

Deno.test(
  'WorkerLifecycle - should handle missing heartbeat gracefully',
  async () => {
    const mockQueries = new MockQueries();
    const mockQueue = new MockQueue('test-queue');
    const lifecycle = new WorkerLifecycle(
      mockQueries,
      mockQueue,
      logger
    );

    // Don't start the worker, so workerRow is not initialized
    await lifecycle.sendHeartbeat(); // Should not throw

    assertEquals(lifecycle.isRunning, false);
    assertEquals(lifecycle.isDeprecated, false);
    // Should not have called sendHeartbeat on queries
    assertEquals(mockQueries.sendHeartbeatCallCount, 0);
  }
);

Deno.test('WorkerLifecycle - deprecated state transitions', async () => {
  const mockQueries = new MockQueries();
  const mockQueue = new MockQueue('test-queue');
  const lifecycle = new WorkerLifecycle(
    mockQueries,
    mockQueue,
    logger
  );

  // Start and deprecate the worker
  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  lifecycle.transitionToDeprecated();
  assertEquals(lifecycle.isDeprecated, true);

  // Should be able to transition to stopping from deprecated
  lifecycle.transitionToStopping();
  assertEquals(lifecycle.isStopping, true);

  // Should be able to transition to stopped
  lifecycle.acknowledgeStop();
  assertEquals(lifecycle.isStopped, true);
});

Deno.test(
  'WorkerLifecycle - cannot transition to deprecated from non-running states',
  () => {
    const mockQueries = new MockQueries();
    const mockQueue = new MockQueue('test-queue');
    const lifecycle = new WorkerLifecycle(
      mockQueries,
      mockQueue,
      logger
    );

    // Try to transition to deprecated from created state
    assertThrows(
      () => {
        lifecycle.transitionToDeprecated();
      },
      TransitionError,
      'Cannot transition from created to deprecated'
    );
  }
);

Deno.test(
  'WorkerLifecycle - should log appropriate message when transitioning to deprecated',
  async () => {
    const logs: string[] = [];
    const testLogger: Logger = {
      debug: () => {},
      info: (msg: string) => logs.push(msg),
      error: () => {},
      warn: () => {},
    };

    const mockQueries = new MockQueries();
    const mockQueue = new MockQueue('test-queue');
    const lifecycle = new WorkerLifecycle(
      mockQueries,
      mockQueue,
      testLogger,
      { heartbeatInterval: 0 } // No interval for testing
    );

    // Start the worker
    await lifecycle.acknowledgeStart({
      workerId: 'test-worker-id',
      edgeFunctionName: 'test-function',
    });

    // Send deprecated heartbeat
    mockQueries.nextResult = { is_deprecated: true };
    await lifecycle.sendHeartbeat();

    // Check that the deprecation message was logged
    const deprecationLog = logs.find((log) =>
      log.includes(
        'Worker marked for deprecation, transitioning to deprecated state'
      )
    );
    assertEquals(deprecationLog !== undefined, true);
  }
);

Deno.test(
  'WorkerLifecycle - should respect heartbeat interval',
  async () => {
    const mockQueries = new MockQueries();
    const mockQueue = new MockQueue('test-queue');
    const lifecycle = new WorkerLifecycle(
      mockQueries,
      mockQueue,
      logger,
      { heartbeatInterval: 5000 } // 5 second interval
    );

    // Start the worker
    await lifecycle.acknowledgeStart({
      workerId: 'test-worker-id',
      edgeFunctionName: 'test-function',
    });

    // First heartbeat should be sent
    await lifecycle.sendHeartbeat();
    assertEquals(mockQueries.sendHeartbeatCallCount, 1);

    // Immediate second heartbeat should not be sent (interval not passed)
    await lifecycle.sendHeartbeat();
    assertEquals(mockQueries.sendHeartbeatCallCount, 1);

    // More immediate calls should still not send
    await lifecycle.sendHeartbeat();
    await lifecycle.sendHeartbeat();
    assertEquals(mockQueries.sendHeartbeatCallCount, 1);
  }
);

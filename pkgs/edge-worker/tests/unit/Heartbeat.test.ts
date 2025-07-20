import { assertEquals } from '@std/assert';
import { Heartbeat } from '../../src/core/Heartbeat.ts';
import type { Queries } from '../../src/core/Queries.ts';
import type { WorkerRow } from '../../src/core/types.ts';
import { createLoggingFactory } from '../../src/platform/logging.ts';

const loggingFactory = createLoggingFactory();
loggingFactory.setLogLevel('info');
const logger = loggingFactory.createLogger('Heartbeat');

// Mock Queries class
class MockQueries implements Pick<Queries, 'sendHeartbeat'> {
  public callCount = 0;
  public lastWorkerRow?: WorkerRow;
  public nextResult: { is_deprecated: boolean } = { is_deprecated: false };

  sendHeartbeat(workerRow: WorkerRow): Promise<{ is_deprecated: boolean }> {
    this.callCount++;
    this.lastWorkerRow = workerRow;
    return Promise.resolve(this.nextResult);
  }
}

const createMockWorkerRow = (): WorkerRow => ({
  worker_id: 'test-worker-id',
  queue_name: 'test-queue',
  function_name: 'test-function',
  started_at: new Date().toISOString(),
  deprecated_at: null,
  last_heartbeat_at: new Date().toISOString(),
});

Deno.test('Heartbeat - should not send heartbeat if interval has not passed', async () => {
  const mockQueries = new MockQueries();
  const workerRow = createMockWorkerRow();
  const heartbeat = new Heartbeat(5000, mockQueries as unknown as Queries, workerRow, logger);

  // First send should work
  const result1 = await heartbeat.send();
  assertEquals(mockQueries.callCount, 1);
  assertEquals(result1.is_deprecated, false);

  // Immediate second send should not trigger query
  const result2 = await heartbeat.send();
  assertEquals(mockQueries.callCount, 1); // Still 1, no new call
  assertEquals(result2.is_deprecated, false);
});

Deno.test('Heartbeat - should send heartbeat after interval passes', async () => {
  const mockQueries = new MockQueries();
  const workerRow = createMockWorkerRow();
  // Use a short interval for testing
  const heartbeat = new Heartbeat(10, mockQueries as unknown as Queries, workerRow, logger);

  // First send
  const result1 = await heartbeat.send();
  assertEquals(mockQueries.callCount, 1);

  // Wait for interval to pass
  await new Promise(resolve => setTimeout(resolve, 20));

  // Second send should trigger
  const result2 = await heartbeat.send();
  assertEquals(mockQueries.callCount, 2);
  assertEquals(result2.is_deprecated, false);
});

Deno.test('Heartbeat - should return deprecation status from queries', async () => {
  const mockQueries = new MockQueries();
  const workerRow = createMockWorkerRow();
  const heartbeat = new Heartbeat(5000, mockQueries as unknown as Queries, workerRow, logger);

  // First send - not deprecated
  mockQueries.nextResult = { is_deprecated: false };
  const result1 = await heartbeat.send();
  assertEquals(result1.is_deprecated, false);

  // Wait and send again - now deprecated
  await new Promise(resolve => setTimeout(resolve, 10));
  mockQueries.nextResult = { is_deprecated: true };
  
  // Need to use short interval to test
  const heartbeat2 = new Heartbeat(10, mockQueries as unknown as Queries, workerRow, logger);
  const result2 = await heartbeat2.send();
  assertEquals(result2.is_deprecated, true);
});

Deno.test('Heartbeat - should pass worker row to queries', async () => {
  const mockQueries = new MockQueries();
  const workerRow = createMockWorkerRow();
  const heartbeat = new Heartbeat(5000, mockQueries as unknown as Queries, workerRow, logger);

  await heartbeat.send();
  
  assertEquals(mockQueries.lastWorkerRow, workerRow);
  assertEquals(mockQueries.lastWorkerRow?.worker_id, 'test-worker-id');
  assertEquals(mockQueries.lastWorkerRow?.queue_name, 'test-queue');
});

Deno.test('Heartbeat - should log correct messages based on deprecation status', async () => {
  const logs: string[] = [];
  const testLogger = {
    debug: (msg: string) => logs.push(msg),
    info: () => {},
    error: () => {},
  };

  const mockQueries = new MockQueries();
  const workerRow = createMockWorkerRow();
  const heartbeat = new Heartbeat(10, mockQueries as unknown as Queries, workerRow, testLogger as unknown as ReturnType<typeof logger>);

  // Not deprecated
  mockQueries.nextResult = { is_deprecated: false };
  await heartbeat.send();
  const okLog = logs.find(log => log === 'OK');
  assertEquals(okLog !== undefined, true);

  // Wait for interval
  await new Promise(resolve => setTimeout(resolve, 20));
  logs.length = 0; // Clear logs

  // Deprecated
  mockQueries.nextResult = { is_deprecated: true };
  await heartbeat.send();
  const deprecatedLog = logs.find(log => log === 'DEPRECATED');
  assertEquals(deprecatedLog !== undefined, true);
});
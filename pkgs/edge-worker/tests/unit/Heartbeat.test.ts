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

  async sendHeartbeat(workerRow: WorkerRow): Promise<{ is_deprecated: boolean }> {
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
  const heartbeat = new Heartbeat(5000, mockQueries as any, workerRow, logger);

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
  // Use a very short interval for testing
  const heartbeat = new Heartbeat(10, mockQueries as any, workerRow, logger);

  // First send
  await heartbeat.send();
  assertEquals(mockQueries.callCount, 1);

  // Wait for interval to pass
  await new Promise(resolve => setTimeout(resolve, 20));

  // Second send should trigger query
  await heartbeat.send();
  assertEquals(mockQueries.callCount, 2);
});

Deno.test('Heartbeat - should return deprecation status from queries', async () => {
  const mockQueries = new MockQueries();
  const workerRow = createMockWorkerRow();
  const heartbeat = new Heartbeat(5000, mockQueries as any, workerRow, logger);

  // Test non-deprecated response
  mockQueries.nextResult = { is_deprecated: false };
  const result1 = await heartbeat.send();
  assertEquals(result1.is_deprecated, false);

  // Reset interval
  await new Promise(resolve => setTimeout(resolve, 5100));

  // Test deprecated response
  mockQueries.nextResult = { is_deprecated: true };
  const result2 = await heartbeat.send();
  assertEquals(result2.is_deprecated, true);
});

Deno.test('Heartbeat - should pass worker row to queries', async () => {
  const mockQueries = new MockQueries();
  const workerRow = createMockWorkerRow();
  const heartbeat = new Heartbeat(5000, mockQueries as any, workerRow, logger);

  await heartbeat.send();
  
  assertEquals(mockQueries.lastWorkerRow, workerRow);
});

Deno.test('Heartbeat - should log correct messages based on deprecation status', async () => {
  const mockQueries = new MockQueries();
  const workerRow = createMockWorkerRow();
  
  // Create a custom logger to capture logs
  const logs: string[] = [];
  const testLogger = {
    debug: (msg: string) => logs.push(msg),
    info: () => {},
    error: () => {},
  };
  
  const heartbeat = new Heartbeat(10, mockQueries as any, workerRow, testLogger as any);

  // Test non-deprecated
  mockQueries.nextResult = { is_deprecated: false };
  await heartbeat.send();
  assertEquals(logs[logs.length - 1], 'OK');

  // Wait for interval
  await new Promise(resolve => setTimeout(resolve, 20));

  // Test deprecated
  mockQueries.nextResult = { is_deprecated: true };
  await heartbeat.send();
  assertEquals(logs[logs.length - 1], 'DEPRECATED');
});
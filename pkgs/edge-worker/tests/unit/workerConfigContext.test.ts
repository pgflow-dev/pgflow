import { assertEquals, assertThrows } from '@std/assert';
import type { QueueWorkerConfig, FlowWorkerConfig } from '../../src/core/workerConfigTypes.ts';
import { createContextSafeConfig } from '../../src/core/context.ts';
import type { PgmqMessageRecord } from '../../src/queue/types.ts';
import type { Sql } from 'postgres';

Deno.test('createContextSafeConfig excludes sql field and freezes result', () => {
  const mockSql = {} as Sql<Record<string, never>>;
  const config: QueueWorkerConfig = {
    queueName: 'test-queue',
    maxConcurrent: 5,
    retry: { strategy: 'fixed', limit: 3, baseDelay: 2 },
    sql: mockSql,
  };

  const safeConfig = createContextSafeConfig(config);
  
  // Should exclude sql
  assertEquals('sql' in safeConfig, false);
  
  // Should include other fields
  assertEquals(safeConfig.queueName, 'test-queue');
  assertEquals(safeConfig.maxConcurrent, 5);
  assertEquals(safeConfig.retry?.limit, 3);
  
  // Should be frozen
  assertThrows(() => {
    (safeConfig as Record<string, unknown>).queueName = 'modified';
  }, TypeError);
});

Deno.test('Queue worker context includes workerConfig for GitHub issue use case', async () => {
  const mockMessage: PgmqMessageRecord<{test: string}> = {
    msg_id: 123,
    read_ct: 2, // Current retry attempt
    enqueued_at: '2024-01-01T00:00:00Z',
    vt: '2024-01-01T00:01:00Z',
    message: { test: 'data' },
    headers: null,
  };

  const mockConfig: QueueWorkerConfig = {
    queueName: 'test-queue',
    retry: { strategy: 'fixed', limit: 3, baseDelay: 2 }, // Max 3 retries
    maxConcurrent: 5,
  };

  // Simulate context creation  
  const context = {
    env: {},
    shutdownSignal: new AbortController().signal,
    rawMessage: mockMessage,
    workerConfig: createContextSafeConfig(mockConfig),
  };

  type ContextType = typeof context;
  let receivedContext: ContextType | undefined;
  const handler = (_payload: {test: string}, context: ContextType) => {
    receivedContext = context;
  };

  await handler(mockMessage.message, context);
  
  // Verify config is accessible
  if (!receivedContext) throw new Error('receivedContext should be assigned');
  assertEquals(receivedContext.workerConfig.queueName, 'test-queue');
  assertEquals(receivedContext.workerConfig.retry?.limit, 3);
  assertEquals(receivedContext.rawMessage.read_ct, 2);
  
  // Test the GitHub issue use case - detecting last retry
  if (!receivedContext.workerConfig.retry) throw new Error('retry config should exist');
  const isLastRetry = receivedContext.rawMessage.read_ct >= receivedContext.workerConfig.retry.limit;
  assertEquals(isLastRetry, false); // 2 < 3, not last retry yet
  
  // Test when it IS the last retry
  const lastRetryMessage = { ...mockMessage, read_ct: 3 };
  const lastRetryContext = { ...context, rawMessage: lastRetryMessage };
  await handler(lastRetryMessage.message, lastRetryContext);
  
  if (!receivedContext.workerConfig.retry) throw new Error('retry config should exist');
  const isActuallyLastRetry = receivedContext.rawMessage.read_ct >= receivedContext.workerConfig.retry.limit;
  assertEquals(isActuallyLastRetry, true); // 3 >= 3, this is the last retry
});

Deno.test('Queue worker config immutability prevents handler modifications', async () => {
  const mockConfig: QueueWorkerConfig = {
    queueName: 'test-queue',
    retry: { strategy: 'fixed', limit: 3, baseDelay: 2 },
  };

  const context = {
    env: {},
    shutdownSignal: new AbortController().signal,
    rawMessage: { msg_id: 1, read_ct: 1, message: {} },
    workerConfig: createContextSafeConfig(mockConfig),
  };

  type ContextType = typeof context;
  const handler = (_payload: unknown, context: ContextType) => {
    // Handler attempts to modify config - should throw
    assertThrows(() => {
      (context.workerConfig as Record<string, unknown>).queueName = 'hacked';
    }, TypeError, 'Cannot assign to read only property');
    
    assertThrows(() => {
      (context.workerConfig.retry as unknown as Record<string, unknown>).limit = 999;
    }, TypeError, 'Cannot assign to read only property'); 
  };

  await handler({}, context);
});

Deno.test('Flow worker context includes workerConfig', async () => {
  const mockConfig: FlowWorkerConfig = {
    maxConcurrent: 10,
    batchSize: 5,
    visibilityTimeout: 15,
  };

  const context = {
    env: {},
    shutdownSignal: new AbortController().signal,
    rawMessage: { msg_id: 456, read_ct: 1, message: {} },
    stepTask: { flow_slug: 'test', step_slug: 'step', msg_id: 456, run_id: 'run', input: {} },
    workerConfig: createContextSafeConfig(mockConfig),
  };

  type ContextType = typeof context;
  let receivedContext: ContextType | undefined;
  const handler = (_input: unknown, context: ContextType) => {
    receivedContext = context;
  };

  await handler({}, context);
  
  if (!receivedContext) throw new Error('receivedContext should be assigned');
  assertEquals(receivedContext.workerConfig.maxConcurrent, 10);
  assertEquals(receivedContext.workerConfig.batchSize, 5);
  assertEquals(receivedContext.workerConfig.visibilityTimeout, 15);
  
  // Should be immutable
  assertThrows(() => {
    (receivedContext!.workerConfig as Record<string, unknown>).maxConcurrent = 999;
  }, TypeError);
});

Deno.test('Legacy retry config conversion is included in context', () => {
  // Simulate legacy config input
  const legacyConfig = {
    queueName: 'legacy-queue',
    retryLimit: 4,
    retryDelay: 10,
    // No retry field - should be converted
  };

  // Simulate the conversion that happens in createQueueWorker
  const resolvedConfig: QueueWorkerConfig = {
    ...legacyConfig,
    retry: {
      strategy: 'fixed' as const,
      limit: legacyConfig.retryLimit,
      baseDelay: legacyConfig.retryDelay,
    },
  };

  const safeConfig = createContextSafeConfig(resolvedConfig);
  
  // Should show converted retry config, not legacy fields
  assertEquals(safeConfig.retry?.strategy, 'fixed');
  assertEquals(safeConfig.retry?.limit, 4);
  assertEquals(safeConfig.retry?.baseDelay, 10);
  
  // Legacy fields should still be present (for backward compatibility)
  assertEquals(safeConfig.retryLimit, 4);
  assertEquals(safeConfig.retryDelay, 10);
});
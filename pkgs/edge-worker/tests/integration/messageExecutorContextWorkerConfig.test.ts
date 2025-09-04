import { assertEquals, assertThrows } from '@std/assert';
import { withTransaction } from '../db.ts';
import type { PgmqMessageRecord } from '../../src/queue/types.ts';
import type { QueueWorkerConfig } from '../../src/core/workerConfigTypes.ts';
import { createQueueWorkerContext } from '../../src/core/supabase-test-utils.ts';
import { createContextSafeConfig } from '../../src/core/context.ts';
import type { SupabaseEnv } from '@pgflow/dsl/supabase';

const DEFAULT_TEST_SUPABASE_ENV: SupabaseEnv = {
  EDGE_WORKER_DB_URL: 'postgresql://test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SB_EXECUTION_ID: 'test-execution-id',
};

Deno.test(
  'MessageExecutor - handler receives workerConfig in context', 
  withTransaction(async (sql) => {
    const config: QueueWorkerConfig = {
      queueName: 'test-config-queue',
      maxConcurrent: 7,
      retry: { strategy: 'exponential', limit: 4, baseDelay: 1 },
    };

    let receivedWorkerConfig: QueueWorkerConfig | undefined;
    const handler = (_payload: {test: string}, context: ReturnType<typeof createQueueWorkerContext>) => {
      receivedWorkerConfig = context.workerConfig;
    };

    const mockMessage: PgmqMessageRecord<{test: string}> = {
      msg_id: 123,
      read_ct: 2,
      enqueued_at: '2024-01-01T00:00:00Z', 
      vt: '2024-01-01T00:01:00Z',
      message: { test: 'config test' }
    };

    // Create context similar to what createQueueWorker does
    const context = createQueueWorkerContext({
      env: DEFAULT_TEST_SUPABASE_ENV,
      sql,
      abortSignal: new AbortController().signal,
      rawMessage: mockMessage,
      workerConfig: createContextSafeConfig({
        ...config,
        sql, // Will be excluded
        connectionString: 'test://connection',
        env: DEFAULT_TEST_SUPABASE_ENV,
      }),
    });

    await handler(mockMessage.message, context);
    
    // Verify worker config is present and correct
    if (!receivedWorkerConfig) {
      throw new Error('Expected receivedWorkerConfig to be defined');
    }
    
    assertEquals(receivedWorkerConfig.queueName, 'test-config-queue');
    assertEquals(receivedWorkerConfig.maxConcurrent, 7); 
    
    if (!receivedWorkerConfig.retry) {
      throw new Error('Expected receivedWorkerConfig.retry to be defined');
    }
    
    assertEquals(receivedWorkerConfig.retry.limit, 4);
    assertEquals(receivedWorkerConfig.retry.strategy, 'exponential');
    
    // Verify sql field was excluded
    assertEquals('sql' in receivedWorkerConfig, false);
    
    // Verify it's immutable
    assertThrows(() => {
      (receivedWorkerConfig as Record<string, unknown>).maxConcurrent = 999;
    }, TypeError);
  })
);
import { assertEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import type { PlatformAdapter } from '../../src/platform/types.ts';
import type { SupabaseEnv, SupabaseResources } from '@pgflow/dsl/supabase';
import { createServiceSupabaseClient } from '../../src/core/supabase-utils.ts';
import { integrationConfig } from '../config.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { waitFor } from '../e2e/_helpers.ts';
import { waitForQueue } from '../helpers.ts';

const QUEUE_NAME = 'stopping_worker';
const TEST_SUPABASE_ENV: SupabaseEnv = {
  SUPABASE_DB_URL: 'postgresql://test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SB_EXECUTION_ID: 'test-execution-id',
};

function createAbortAwarePlatformAdapter(
  sql: Parameters<typeof withTransaction>[0] extends (sql: infer T) => unknown ? T : never
): PlatformAdapter<SupabaseResources> {
  const abortController = new AbortController();
  const platformResources: SupabaseResources = {
    sql,
    supabase: createServiceSupabaseClient(TEST_SUPABASE_ENV),
  };

  return {
    get env() {
      return TEST_SUPABASE_ENV;
    },
    get shutdownSignal() {
      return abortController.signal;
    },
    get platformResources() {
      return platformResources;
    },
    get connectionString() {
      return integrationConfig.dbUrl;
    },
    get isLocalEnvironment() {
      return false;
    },
    requestShutdown() {
      abortController.abort();
    },
    async startWorker() {},
    async stopWorker() {},
  };
}

Deno.test(
  'worker.stop aborts the handler shutdown signal',
  withTransaction(async (sql) => {
    let handlerStarted = false;
    let sawAbortedSignal = false;

    const worker = createQueueWorker(
      async (_payload, context) => {
        handlerStarted = true;
        await new Promise<void>((resolve) => {
          context.shutdownSignal.addEventListener(
            'abort',
            () => {
              sawAbortedSignal = context.shutdownSignal.aborted;
              resolve();
            },
            { once: true }
          );
        });
      },
      {
        sql,
        maxConcurrent: 1,
        maxPollSeconds: 1,
        visibilityTimeout: 5,
        queueName: QUEUE_NAME,
      },
      createFakeLogger,
      createAbortAwarePlatformAdapter(sql)
    );

    try {
      worker.startOnlyOnce({
        edgeFunctionName: 'test',
        workerId: crypto.randomUUID(),
      });
      await waitForQueue(sql, QUEUE_NAME);

      await sql`SELECT pgmq.send(${QUEUE_NAME}, '{}'::jsonb)`;

      await waitFor(() => handlerStarted, {
        timeoutMs: 5000,
        pollIntervalMs: 50,
        description: 'handler to start',
      });

      const stopStartedAt = Date.now();
      await worker.stop();

      assertEquals(Date.now() - stopStartedAt < 300, true);
      assertEquals(sawAbortedSignal, true);
    } finally {
      try {
        await worker.stop();
      } catch {
        // ignore cleanup errors after test assertion
      }
    }
  })
);

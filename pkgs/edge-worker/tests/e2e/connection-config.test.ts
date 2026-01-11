import { withSql } from '../sql.ts';
import { assertEquals, assertGreaterOrEqual } from 'jsr:@std/assert';
import {
  sendBatch,
  seqLastValue,
  startWorker,
  waitFor,
  waitForSeqToIncrementBy,
} from './_helpers.ts';
import type postgres from 'postgres';

interface ConnTestResult {
  queue_name: string;
  status: string;
  actual: Record<string, unknown> | null;
  error_message: string | null;
}

async function setupTest(sql: postgres.Sql, queueName: string) {
  await sql`CREATE SEQUENCE IF NOT EXISTS conn_test_seq`;
  await sql`ALTER SEQUENCE conn_test_seq RESTART WITH 1`;
  await sql`
    SELECT * FROM pgmq.drop_queue(${queueName})
    WHERE EXISTS (
      SELECT 1 FROM pgmq.list_queues() WHERE queue_name = ${queueName}
    )
  `;
  await sql`SELECT pgmq.create(${queueName})`;
  await sql`
    DELETE FROM pgflow.workers
    WHERE last_heartbeat_at < NOW() - INTERVAL '6 seconds'
  `;
}

async function setupMaxPgConnectionsTest(sql: postgres.Sql, queueName: string) {
  // Create results table if not exists (generic, reusable for other tests)
  await sql`
    CREATE TABLE IF NOT EXISTS e2e_test_results (
      id SERIAL PRIMARY KEY,
      queue_name TEXT NOT NULL,
      status TEXT NOT NULL,
      actual JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Clear previous results for this queue
  await sql`DELETE FROM e2e_test_results WHERE queue_name = ${queueName}`;
  // Standard queue setup
  await sql`
    SELECT * FROM pgmq.drop_queue(${queueName})
    WHERE EXISTS (
      SELECT 1 FROM pgmq.list_queues() WHERE queue_name = ${queueName}
    )
  `;
  await sql`SELECT pgmq.create(${queueName})`;
  await sql`
    DELETE FROM pgflow.workers
    WHERE last_heartbeat_at < NOW() - INTERVAL '6 seconds'
  `;
}

async function waitForTestResult(
  sql: postgres.Sql,
  queueName: string,
  timeoutMs = 10000
): Promise<ConnTestResult> {
  return await waitFor(
    async () => {
      const rows = await sql<ConnTestResult[]>`
        SELECT queue_name, status, actual, error_message
        FROM e2e_test_results
        WHERE queue_name = ${queueName}
        LIMIT 1
      `;
      return rows.length > 0 ? rows[0] : false;
    },
    { timeoutMs, description: `test result for ${queueName}` }
  );
}

Deno.test(
  {
    name: 'connection config - zero config uses Docker pooler',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    await withSql(async (sql) => {
      const queueName = 'conn_zero_config';
      await setupTest(sql, queueName);
      await startWorker(queueName);
      await sendBatch(1, queueName);
      await waitForSeqToIncrementBy(1, {
        seqName: 'conn_test_seq',
        timeoutMs: 10000,
      });
      assertGreaterOrEqual(await seqLastValue('conn_test_seq'), 1);
    });
  }
);

Deno.test(
  {
    name: 'connection config - connectionString option works',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    await withSql(async (sql) => {
      const queueName = 'conn_string';
      await setupTest(sql, queueName);
      await startWorker(queueName);
      await sendBatch(1, queueName);
      await waitForSeqToIncrementBy(1, {
        seqName: 'conn_test_seq',
        timeoutMs: 10000,
      });
      assertGreaterOrEqual(await seqLastValue('conn_test_seq'), 1);
    });
  }
);

Deno.test(
  {
    name: 'connection config - EDGE_WORKER_DB_URL env var works',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    await withSql(async (sql) => {
      // The conn_env_var edge function:
      // 1. Overrides EDGE_WORKER_DB_URL to the direct Supabase URL (not docker pooler)
      // 2. In the handler, verifies workerConfig.connectionString matches the expected URL
      // 3. If the env var was ignored (docker pooler fallback), throws an error
      // 4. If the env var is used correctly, increments the sequence
      const queueName = 'conn_env_var';
      await setupTest(sql, queueName);
      await startWorker(queueName);
      await sendBatch(1, queueName);
      await waitForSeqToIncrementBy(1, {
        seqName: 'conn_test_seq',
        timeoutMs: 10000,
      });
      assertGreaterOrEqual(await seqLastValue('conn_test_seq'), 1);
    });
  }
);

Deno.test(
  {
    name: 'connection config - custom sql object works',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    await withSql(async (sql) => {
      const queueName = 'conn_custom_sql';
      await setupTest(sql, queueName);
      await startWorker(queueName);
      await sendBatch(1, queueName);
      await waitForSeqToIncrementBy(1, {
        seqName: 'conn_test_seq',
        timeoutMs: 10000,
      });
      assertGreaterOrEqual(await seqLastValue('conn_test_seq'), 1);
    });
  }
);

Deno.test(
  {
    name: 'connection config - default maxPgConnections is 4',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    await withSql(async (sql) => {
      const queueName = 'conn_max_pg_default';
      await setupMaxPgConnectionsTest(sql, queueName);
      await startWorker(queueName);
      await sendBatch(1, queueName);

      const result = await waitForTestResult(sql, queueName);
      assertEquals(
        result.status,
        'success',
        `Expected success but got error: ${result.error_message} (actual=${JSON.stringify(result.actual)})`
      );
      assertEquals(result.actual?.max, 4);
    });
  }
);

Deno.test(
  {
    name: 'connection config - maxPgConnections override works',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  async () => {
    await withSql(async (sql) => {
      const queueName = 'conn_max_pg_override';
      await setupMaxPgConnectionsTest(sql, queueName);
      await startWorker(queueName);
      await sendBatch(1, queueName);

      const result = await waitForTestResult(sql, queueName);
      assertEquals(
        result.status,
        'success',
        `Expected success but got error: ${result.error_message} (actual=${JSON.stringify(result.actual)})`
      );
      assertEquals(result.actual?.max, 7);
    });
  }
);

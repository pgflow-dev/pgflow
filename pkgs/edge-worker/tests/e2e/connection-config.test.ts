import { withSql } from '../sql.ts';
import { assertGreaterOrEqual } from 'jsr:@std/assert';
import {
  sendBatch,
  seqLastValue,
  startWorker,
  waitForSeqToIncrementBy,
} from './_helpers.ts';
import type postgres from 'postgres';

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

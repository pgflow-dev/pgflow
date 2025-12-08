import { withSql } from '../sql.ts';
import { assertEquals, assertGreaterOrEqual } from 'jsr:@std/assert';
import {
  sendBatch,
  seqLastValue,
  startWorkerWithAuth,
  waitForSeqToIncrementBy,
} from './_helpers.ts';
import type postgres from 'postgres';

// Must match the value in supabase/functions/auth_test/index.ts
const PRODUCTION_SERVICE_ROLE_KEY = 'test-production-service-role-key-xyz789';
const QUEUE_NAME = 'auth_test';
const SEQ_NAME = 'auth_test_seq';

async function setupTest(sql: postgres.Sql) {
  await sql`CREATE SEQUENCE IF NOT EXISTS ${sql(SEQ_NAME)}`;
  await sql`ALTER SEQUENCE ${sql(SEQ_NAME)} RESTART WITH 1`;
  await sql`
    SELECT * FROM pgmq.drop_queue(${QUEUE_NAME})
    WHERE EXISTS (
      SELECT 1 FROM pgmq.list_queues() WHERE queue_name = ${QUEUE_NAME}
    )
  `;
  await sql`SELECT pgmq.create(${QUEUE_NAME})`;
  await sql`
    DELETE FROM pgflow.workers
    WHERE last_heartbeat_at < NOW() - INTERVAL '6 seconds'
  `;
}

// ============================================================
// Test Case 1: 401 - Missing Authorization header
// ============================================================
Deno.test(
  {
    name: 'authorization - 401 when missing Authorization header',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  () => withSql(async (sql) => {
    await setupTest(sql);

    const result = await startWorkerWithAuth(QUEUE_NAME, {
      headers: {}, // No Authorization header
      expectStatus: 401,
    });

    assertEquals(result.status, 401);
    assertEquals(result.body, { error: 'Unauthorized', message: 'Unauthorized' });
  })
);

// ============================================================
// Test Case 2: 401 - Wrong Bearer token
// ============================================================
Deno.test(
  {
    name: 'authorization - 401 when wrong Bearer token',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  () => withSql(async (sql) => {
    await setupTest(sql);

    const result = await startWorkerWithAuth(QUEUE_NAME, {
      headers: {
        'Authorization': 'Bearer wrong-key-123',
      },
      expectStatus: 401,
    });

    assertEquals(result.status, 401);
    assertEquals(result.body, { error: 'Unauthorized', message: 'Unauthorized' });
  })
);

// ============================================================
// Test Case 3: 200 - Correct Bearer token (worker starts successfully)
// ============================================================
Deno.test(
  {
    name: 'authorization - 200 with correct Bearer token',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  () => withSql(async (sql) => {
    await setupTest(sql);

    const result = await startWorkerWithAuth(QUEUE_NAME, {
      headers: {
        'Authorization': `Bearer ${PRODUCTION_SERVICE_ROLE_KEY}`,
      },
    });

    assertEquals(result.status, 200);

    // Verify worker actually started by sending a message and checking sequence
    const seqBefore = await seqLastValue(SEQ_NAME);
    await sendBatch(1, QUEUE_NAME);
    await waitForSeqToIncrementBy(1, {
      seqName: SEQ_NAME,
      timeoutMs: 10000,
    });
    assertGreaterOrEqual(await seqLastValue(SEQ_NAME), seqBefore + 1);
  })
);

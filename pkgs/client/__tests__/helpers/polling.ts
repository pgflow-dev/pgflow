import { PgflowSqlClient } from '@pgflow/core';
import type { AnyFlow } from '@pgflow/dsl';
import type postgres from 'postgres';

/**
 * Default test worker UUID
 */
export const TEST_WORKER_UUID = '11111111-1111-1111-1111-111111111111';

/**
 * Ensures a worker exists in pgflow.workers table
 * Mimics pgflow_tests.ensure_worker from seed.sql
 */
export async function ensureWorker(
  sql: postgres.Sql,
  queueName: string,
  workerUuid: string = TEST_WORKER_UUID,
  functionName: string = 'test_worker'
): Promise<string> {
  const result = await sql<{ worker_id: string }[]>`
    INSERT INTO pgflow.workers (worker_id, queue_name, function_name, last_heartbeat_at)
    VALUES (${workerUuid}::uuid, ${queueName}, ${functionName}, now())
    ON CONFLICT (worker_id) DO UPDATE SET 
      last_heartbeat_at = now(),
      queue_name = EXCLUDED.queue_name,
      function_name = EXCLUDED.function_name
    RETURNING worker_id;
  `;
  return result[0].worker_id;
}

/**
 * Reads messages and starts tasks in one call
 * Mimics pgflow_tests.read_and_start from seed.sql
 */
export async function readAndStart<TFlow extends AnyFlow>(
  sql: postgres.Sql,
  sqlClient: PgflowSqlClient<TFlow>,
  flowSlug: string,
  vt: number = 1,
  qty: number = 1,
  workerUuid: string = TEST_WORKER_UUID,
  functionName: string = 'test_worker'
) {
  // 1. Ensure the worker exists / update its heartbeat
  const workerId = await ensureWorker(sql, flowSlug, workerUuid, functionName);

  // 2. Read messages from the queue
  const messages = await sqlClient.readMessages(flowSlug, vt, qty, 1, 50);

  // 3. If no messages, return empty array
  if (messages.length === 0) {
    return [];
  }

  // 4. Start the tasks and return the resulting rows
  const msgIds = messages.map(m => m.msg_id);
  const tasks = await sqlClient.startTasks(flowSlug, msgIds, workerId);

  return tasks;
}
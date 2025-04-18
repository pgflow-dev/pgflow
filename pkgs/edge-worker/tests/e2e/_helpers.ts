import { sql } from '../sql.js';
import { setTimeout as delay } from 'node:timers/promises';
import ProgressBar from 'progress';
import chalk from 'chalk';

interface WaitForOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  description?: string;
}

export function log(message: string, ...args: unknown[]) {
  console.log(chalk.dim(` -> ${message}`), ...args);
}

export async function waitFor<T>(
  predicate: () => Promise<T | false>,
  options: WaitForOptions = {}
): Promise<T> {
  const {
    pollIntervalMs = 250,
    timeoutMs = 30000,
    description = 'condition',
  } = options;

  const startTime = Date.now();

  while (true) {
    const result = await predicate();

    if (result) return result;

    if (Date.now() - startTime > timeoutMs) {
      throw new Error(
        `Timeout after ${timeoutMs}ms waiting for ${description}`
      );
    }

    await delay(pollIntervalMs);
  }
}

export async function sendBatch(count: number, queueName: string) {
  return await sql`
    SELECT pgmq.send_batch(
      ${queueName},
      ARRAY(
        SELECT '{}'::jsonb
        FROM generate_series(1, ${count}::integer)
      )
    )`;
}

export async function seqLastValue(
  seqName = 'test_seq'
): Promise<number> {
  // Postgres sequences are startWorkerd with a value of 1,
  // but incrementing them for the first time does not increment the last_value,
  // only sets is_called to true
  const seqResult = await sql`
    SELECT
      CASE
        WHEN is_called THEN last_value::integer
        ELSE 0
      END as last_value
    FROM ${sql(seqName)}`;
  return seqResult[0].last_value;
}

interface WaitForSeqValueOptions {
  pollIntervalMs?: number;
  seqName?: string;
  timeoutMs?: number;
}

export async function waitForSeqToIncrementBy(
  value: number,
  options: WaitForSeqValueOptions = {}
): Promise<number> {
  const { seqName = 'test_seq' } = options;

  const perSecond = 0;

  const progress = new ProgressBar(
    chalk.dim(
      ` -> incrementing "${seqName}": :current/:total (:eta s) [:bar] :percent`
    ),
    {
      total: value,
      width: 20,
      complete: '=',
      incomplete: ' ',
    }
  );

  const startVal = await seqLastValue(seqName);
  let lastVal = startVal;

  return await waitFor(
    async () => {
      lastVal = await seqLastValue(seqName);
      progress.tick(lastVal - progress.curr);
      const incrementedBy = lastVal - startVal;

      return incrementedBy >= value ? lastVal : false;
    },
    {
      ...options,
      description: `sequence ${seqName} to reach value ${value}`,
    }
  );
}

export async function waitForActiveWorker() {
  return await waitFor(
    async () => {
      const [{ has_active: hasActiveWorker }] =
        await sql`SELECT count(*) > 0 AS has_active FROM edge_worker.active_workers`;
      log('waiting for active worker ', hasActiveWorker);
      return hasActiveWorker;
    },
    {
      pollIntervalMs: 300,
      description: 'active worker',
    }
  );
}

export async function fetchWorkers(functionName: string) {
  return await sql`SELECT * FROM edge_worker.workers WHERE function_name = ${functionName}`;
}

export async function startWorker(workerName: string) {
  await sql`SELECT edge_worker.spawn(${workerName}::text)`;
  await waitForActiveWorker();
  log('worker spawned!');
}

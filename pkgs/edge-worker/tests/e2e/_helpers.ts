import { createSql } from '../sql.ts';
import { delay } from '@std/async';
import ProgressBar from 'jsr:@deno-library/progress';
import { dim } from 'https://deno.land/std@0.224.0/fmt/colors.ts';

interface WaitForOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  description?: string;
}

export function log(message: string, ...args: unknown[]) {
  console.log(dim(` -> ${message}`), ...args);
}

export async function waitFor<T>(
  predicate: (() => Promise<T | false>) | (() => T | false),
  options: WaitForOptions = {}
): Promise<T> {
  const {
    pollIntervalMs = 250,
    timeoutMs = 30000,
    description = 'condition',
  } = options;

  const startTime = Date.now();

  while (true) {
    const result = await Promise.resolve(predicate());

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
  const sql = createSql();
  try {
    return await sql`
      SELECT pgmq.send_batch(
        ${queueName},
        ARRAY(
          SELECT '{}'::jsonb
          FROM generate_series(1, ${count}::integer)
        )
      )`;
  } finally {
    await sql.end();
  }
}

export async function seqLastValue(seqName = 'test_seq'): Promise<number> {
  const sql = createSql();
  try {
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
  } finally {
    await sql.end();
  }
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

  const progress = new ProgressBar({
    title: `${seqName} (${perSecond}/s)`,
    total: value,
    width: 20,
    display: dim(
      ` -> incrementing "${seqName}": :completed/:total (:eta left) [:bar] :percent`
    ),
    prettyTime: true,
  });

  const startVal = await seqLastValue(seqName);
  let lastVal = startVal;

  return await waitFor(
    async () => {
      lastVal = await seqLastValue(seqName);
      progress.render(lastVal);
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
      const sql = createSql();
      try {
        const [{ has_active: hasActiveWorker }] =
          await sql`SELECT count(*) > 0 AS has_active FROM pgflow.active_workers`;
        log('waiting for active worker ', hasActiveWorker);
        return hasActiveWorker;
      } finally {
        await sql.end();
      }
    },
    {
      pollIntervalMs: 300,
      description: 'active worker',
    }
  );
}

export async function fetchWorkers(functionName: string) {
  const sql = createSql();
  try {
    return await sql`SELECT * FROM pgflow.workers WHERE function_name = ${functionName}`;
  } finally {
    await sql.end();
  }
}

export async function startWorker(workerName: string) {
  const sql = createSql();
  try {
    await sql`SELECT pgflow.spawn(${workerName}::text)`;
  } finally {
    await sql.end();
  }
  await waitForActiveWorker();
  log('worker spawned!');
}

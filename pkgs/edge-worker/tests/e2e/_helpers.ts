import { createSql } from '../sql.ts';
import { delay } from '@std/async';
import ProgressBar from 'jsr:@deno-library/progress';
import { dim } from 'https://deno.land/std@0.224.0/fmt/colors.ts';
import { e2eConfig } from '../config.ts';

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

  try {
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
  } finally {
    progress.end();
  }
}

export async function waitForActiveWorker() {
  return await waitFor(
    async () => {
      const sql = createSql();
      try {
        const workers = await sql`
          SELECT worker_id, function_name, last_heartbeat_at, started_at
          FROM pgflow.workers
          ORDER BY started_at DESC
          LIMIT 5
        `;
        log(
          'workers in DB:',
          workers.length,
          workers.map((w) => ({
            fn: w.function_name,
            hb: w.last_heartbeat_at,
            started: w.started_at,
          }))
        );

        const [{ has_active: hasActiveWorker }] = await sql`
            SELECT count(*) > 0 AS has_active
            FROM pgflow.workers
            WHERE last_heartbeat_at >= NOW() - INTERVAL '6 seconds'
          `;
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
  log(`Starting worker: ${workerName}`);

  // Trigger the edge function via HTTP request
  const apiUrl = e2eConfig.apiUrl;
  const url = `${apiUrl}/functions/v1/${workerName}`;

  log(`Fetching ${url}`);

  // Retry logic for server startup
  let lastError: Error | null = null;
  const maxRetries = 10;
  const retryDelayMs = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);

      const body = await response.text();
      log(
        `Response: ${response.status} ${response.statusText}`,
        body.substring(0, 200)
      );

      if (response.ok) {
        await waitForActiveWorker();
        log('worker spawned!');
        return;
      }

      lastError = new Error(
        `Failed to start worker ${workerName}: ${response.status} ${response.statusText}\n${body}`
      );

      // Retry on 404 (function not ready yet) or 502/503 (server starting)
      if (
        response.status === 404 ||
        response.status === 502 ||
        response.status === 503
      ) {
        log(
          `Retry ${i + 1}/${maxRetries}: ${response.status} ${
            response.statusText
          }`
        );
        await delay(retryDelayMs);
        continue;
      }

      // Other errors - fail immediately
      throw lastError;
    } catch (err) {
      lastError = err as Error;
      if (
        err instanceof TypeError &&
        err.message.includes('error sending request')
      ) {
        // Connection error - server not ready
        log(`Retry ${i + 1}/${maxRetries}: Connection error`);
        await delay(retryDelayMs);
        continue;
      }
      throw err;
    }
  }

  throw (
    lastError ||
    new Error(
      `Failed to start worker ${workerName} after ${maxRetries} retries`
    )
  );
}

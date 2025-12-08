import { createSql } from '../sql.ts';
import { delay } from '@std/async';
import ProgressBar from 'jsr:@deno-library/progress';
import { dim } from 'https://deno.land/std@0.224.0/fmt/colors.ts';
import { e2eConfig } from '../config.ts';

const DEBUG = Deno.env.get('DEBUG') === '1' || Deno.env.get('VERBOSE') === '1';

interface WaitForOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  description?: string;
}

export function log(message: string, ...args: unknown[]) {
  if (DEBUG) console.log(dim(` -> ${message}`), ...args);
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

export async function sendBatch(count: number, queueName: string, debug = false) {
  const sql = createSql();
  const payload = JSON.stringify({ debug });
  try {
    return await sql`
      SELECT pgmq.send_batch(
        ${queueName},
        ARRAY(
          SELECT ${payload}::jsonb
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
  const isTTY = Deno.stdout.isTerminal();

  const progress = isTTY
    ? new ProgressBar({
        title: `${seqName}`,
        total: value,
        width: 20,
        display: dim(
          ` -> incrementing "${seqName}": :completed/:total (:eta left) [:bar] :percent`
        ),
        prettyTime: true,
      })
    : null;

  const startVal = await seqLastValue(seqName);
  const startTime = Date.now();
  let lastVal = startVal;
  let lastReportedPercent = 0;

  try {
    return await waitFor(
      async () => {
        lastVal = await seqLastValue(seqName);
        const incrementedBy = lastVal - startVal;
        const percent = Math.floor((incrementedBy / value) * 100);

        if (progress) {
          progress.render(incrementedBy);
        } else if (percent >= lastReportedPercent + 10) {
          // In CI, report every 10% with average speed
          const elapsedSec = (Date.now() - startTime) / 1000;
          const avgPerSec = Math.round(incrementedBy / elapsedSec);
          console.log(dim(` -> ${seqName}: ${percent}% (${incrementedBy}/${value}) - ${avgPerSec}/s avg`));
          lastReportedPercent = percent;
        }

        return incrementedBy >= value ? lastVal : false;
      },
      {
        ...options,
        description: `sequence ${seqName} to reach value ${value}`,
      }
    );
  } finally {
    const totalSec = (Date.now() - startTime) / 1000;
    const avgPerSec = Math.round(value / totalSec);
    if (progress) {
      progress.end();
    }
    console.log(dim(` -> ${seqName}: 100% complete in ${totalSec.toFixed(1)}s (${avgPerSec}/s avg)`));
  }
}

export async function waitForActiveWorker(functionName: string) {
  return await waitFor(
    async () => {
      const sql = createSql();
      try {
        const workers = await sql`
          SELECT worker_id, function_name, last_heartbeat_at, started_at
          FROM pgflow.workers
          WHERE function_name = ${functionName}
          ORDER BY started_at DESC
          LIMIT 5
        `;
        log(
          `workers in DB for '${functionName}':`,
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
            WHERE function_name = ${functionName}
              AND last_heartbeat_at >= NOW() - INTERVAL '6 seconds'
          `;
        return hasActiveWorker;
      } finally {
        await sql.end();
      }
    },
    {
      pollIntervalMs: 300,
      description: `active worker for '${functionName}'`,
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
        await waitForActiveWorker(workerName);
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

/**
 * Monitor workers table and cron activity in background for debugging.
 * Returns an abort function to stop monitoring.
 */
export function startWorkersMonitor(
  functionName: string,
  intervalMs = 2000
): { stop: () => Promise<void> } {
  const sql = createSql();
  const abortController = new AbortController();

  const monitorLoop = async () => {
    try {
      while (!abortController.signal.aborted) {
        const workers = await sql`
          SELECT worker_id, function_name, started_at, stopped_at, deprecated_at,
                 last_heartbeat_at,
                 EXTRACT(EPOCH FROM (NOW() - last_heartbeat_at))::int as secs_since_heartbeat
          FROM pgflow.workers
          WHERE function_name = ${functionName}
          ORDER BY started_at DESC
        `;

        const workerFunctions = await sql`
          SELECT function_name, enabled, heartbeat_timeout_seconds, last_invoked_at,
                 EXTRACT(EPOCH FROM (NOW() - last_invoked_at))::int as secs_since_invoked
          FROM pgflow.worker_functions
          WHERE function_name = ${functionName}
        `;

        const cronJobs = await sql`
          SELECT jobname, schedule, active
          FROM cron.job
          WHERE jobname LIKE 'pgflow%'
        `;

        const recentCronRuns = await sql`
          SELECT j.jobname, jrd.status, jrd.return_message, jrd.start_time, jrd.end_time
          FROM cron.job_run_details jrd
          JOIN cron.job j ON j.jobid = jrd.jobid
          WHERE j.jobname = 'pgflow_ensure_workers'
          ORDER BY jrd.start_time DESC
          LIMIT 3
        `;

        // Check pg_net HTTP request queue and responses
        const pgNetQueue = await sql`
          SELECT id, url, timeout_milliseconds
          FROM net.http_request_queue
          ORDER BY id DESC
          LIMIT 3
        `.catch(() => []);

        const pgNetResponses = await sql`
          SELECT id, url, created, status_code, error_msg
          FROM net._http_response
          ORDER BY created DESC
          LIMIT 3
        `.catch(() => []);

        log(`Workers (${workers.length}):`, workers.map((w) => ({
          id: String(w.worker_id).slice(0, 8),
          hb_ago: w.secs_since_heartbeat,
          stopped: !!w.stopped_at,
          deprecated: !!w.deprecated_at,
        })));

        log(`Worker functions:`, workerFunctions.map((wf) => ({
          fn: wf.function_name,
          enabled: wf.enabled,
          timeout: wf.heartbeat_timeout_seconds,
          invoked_ago: wf.secs_since_invoked,
        })));

        log(`Cron jobs:`, cronJobs);
        log(`Recent cron runs:`, recentCronRuns.map((r) => ({
          status: r.status,
          msg: String(r.return_message || '').slice(0, 50),
          start: r.start_time,
        })));

        if (Array.isArray(pgNetQueue) && pgNetQueue.length > 0) {
          log(`pg_net queue (${pgNetQueue.length}):`, pgNetQueue.map((r) => ({
            id: r.id,
            url: String(r.url || '').slice(-40),
          })));
        }

        if (Array.isArray(pgNetResponses) && pgNetResponses.length > 0) {
          log(`pg_net responses:`, pgNetResponses.map((r) => ({
            id: r.id,
            status: r.status_code,
            error: r.error_msg,
          })));
        }

        await delay(intervalMs);
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        log('Monitor error:', err);
      }
    } finally {
      await sql.end();
    }
  };

  // Start the monitor loop (don't await it)
  const monitorPromise = monitorLoop();

  return {
    stop: async () => {
      abortController.abort();
      await monitorPromise;
    },
  };
}

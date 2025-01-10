import { sql } from '../sql.ts';
import { delay } from 'jsr:@std/async';
import ProgressBar from 'jsr:@deno-library/progress';
import { dim } from 'https://deno.land/std@0.224.0/fmt/colors.ts';

interface WaitForOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  description?: string;
}

export async function log(message: string, ...args: any[]) {
  console.log(dim(` -> ${message}`), ...args);
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
  seqName: string = 'test_seq'
): Promise<number> {
  // Postgres sequences are initialized with a value of 1,
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

  let perSecond = 0;

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
      const [{ has_active: hasActiveWorker }] =
        await sql`SELECT count(*) > 0 AS has_active FROM supaworker.active_workers`;
      log('waiting for active worker ', hasActiveWorker);
      return hasActiveWorker;
    },
    {
      pollIntervalMs: 300,
      description: 'active worker',
    }
  );
}

export async function fetchWorkers(workerName: string) {
  return await sql`SELECT * FROM supaworker.workers`;
}

export async function startWorker(workerName: string, seconds: number = 5) {
  await sql`SELECT supaworker.spawn(${workerName}::text)`;
  await waitForActiveWorker();
  log('worker spawned!');
}

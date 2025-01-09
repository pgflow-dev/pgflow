import { sql } from '../sql.ts';
import { delay } from 'jsr:@std/async';

export async function sendBatch(count: number) {
  return await sql`
    SELECT pgmq.send_batch(
      'pgflow',
      ARRAY(
        SELECT '{}'::jsonb
        FROM generate_series(1, 6)
      )
    )`;
}

export async function seqLastValue(
  seqName: string = 'test_seq'
): Promise<number> {
  const seqResult = await sql`SELECT last_value::integer FROM ${sql(seqName)}`;
  return seqResult[0].last_value;
}

interface WaitForSeqValueOptions {
  pollIntervalMs?: number;
  seqName?: string;
  timeoutMs?: number;
}

export async function waitForSeqValue(
  value: number,
  options: WaitForSeqValueOptions = {}
): Promise<number> {
  const {
    pollIntervalMs = 1000,
    seqName = 'test_seq',
    timeoutMs = 30000,
  } = options;

  const startTime = Date.now();
  let lastVal = 0;

  console.log(`Waiting for '${seqName}' value (${lastVal}/${value})`);
  while (lastVal < value) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(
        `Timeout waiting for sequence ${seqName} to reach value ${value}`
      );
    }

    await delay(pollIntervalMs);
    lastVal = await seqLastValue(seqName);
    console.log(`Waiting for '${seqName}' value (${lastVal}/${value})`);
  }
  return lastVal;
}

export async function waitForActiveWorker() {
  let hasActiveWorker = false;

  while (!hasActiveWorker) {
    [{ has_active: hasActiveWorker }] =
      await sql`SELECT count(*) > 0 AS has_active FROM supaworker.active_workers`;
    console.log(' -> waiting for active worker ', hasActiveWorker);
    await delay(300);
  }
}

export async function fetchWorkers(workerName: string) {
  return await sql`SELECT * FROM supaworker.workers`;
}

export async function startWorker(workerName: string, seconds: number = 5) {
  await sql`SELECT supaworker.spawn(${workerName})`;

  let workers = await fetchWorkers(workerName);
  console.log('Waiting for worker to spawn...');

  while (workers.length === 0) {
    await delay(500);
    workers = await fetchWorkers(workerName);
  }
  console.log('Worker spawned!');
}

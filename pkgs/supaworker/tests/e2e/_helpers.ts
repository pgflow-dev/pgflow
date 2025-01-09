import { sql } from '../sql.ts';
import { delay } from 'jsr:@std/async';

export async function seqLastValue(): Promise<number> {
  const seqResult = await sql`SELECT last_value::integer FROM test_seq`;
  return seqResult[0].last_value;
}

export async function waitForSeqValue(
  value: number,
  message: string = 'Polling...'
): Promise<number> {
  let lastVal = 0;
  while (lastVal < value) {
    console.log(`${message} current value:`, lastVal);
    await delay(1000);
    lastVal = await seqLastValue();
  }
  return lastVal;
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

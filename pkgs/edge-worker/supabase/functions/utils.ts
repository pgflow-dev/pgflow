import postgres from 'postgres';
import { delay } from '@std/async';

const EDGE_WORKER_DB_URL = Deno.env.get('EDGE_WORKER_DB_URL')!;
console.log('EDGE_WORKER_DB_URL', EDGE_WORKER_DB_URL);

export const sql = postgres(EDGE_WORKER_DB_URL, { prepare: false });

export const sleep = delay;

export function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

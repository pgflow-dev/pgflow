import postgres from 'postgres';
import { delay } from '@std/async';

const connectionUrl =
  Deno.env.get('EDGE_WORKER_DB_URL') || Deno.env.get('DB_POOL_URL');
if (!connectionUrl) {
  throw new Error('No database connection URL available (EDGE_WORKER_DB_URL or DB_POOL_URL)');
}

export const sql = postgres(connectionUrl, { prepare: false });

export const sleep = delay;

export function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

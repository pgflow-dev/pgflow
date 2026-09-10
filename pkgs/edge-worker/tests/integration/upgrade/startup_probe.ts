// #650 upgrade fixture startup probe: the real new worker against a populated
// 0.16.0 database. Requires PGFLOW_UPGRADE_DB_URL (published loopback port of
// the fixture container); never falls back to an ordinary integration
// database. Invoked by scripts/run-queue-upgrade-fixture while the old schema
// and data are still installed. Deno script, not a test file.
import postgres from 'postgres';
import { Flow } from '@pgflow/dsl';
import { createFlowWorker } from '../../../src/flow/createFlowWorker.ts';
import { QueueProtocolMismatchError } from '../../../src/flow/errors.ts';
import { createTestPlatformAdapter } from '../_helpers.ts';
import { fakeLogger } from '../../fakes.ts';

const dbUrl = Deno.env.get('PGFLOW_UPGRADE_DB_URL');

// The failed worker keeps a heartbeat/stop path that may write after the
// probe closes its SQL connection; those dead-socket rejections are expected
// and must not fail the probe. The handler is named and removed before the
// verification connection is created: a CONNECTION_ENDED rejection from
// captureState(verify) is a real verification failure and must fail the
// probe (Deno exits non-zero on unhandled rejections by default).
const suppressConnectionEnded = (event: PromiseRejectionEvent) => {
  if (String(event.reason).includes('CONNECTION_ENDED')) {
    event.preventDefault();
  }
};
globalThis.addEventListener('unhandledrejection', suppressConnectionEnded);
if (!dbUrl) {
  console.error('startup_probe: PGFLOW_UPGRADE_DB_URL is required');
  Deno.exit(1);
}
if (dbUrl.includes('@127.0.0.1:5432') || dbUrl.includes('localhost:5432')) {
  console.error('startup_probe: refusing the ordinary integration database port');
  Deno.exit(1);
}

const sql = postgres(dbUrl, { prepare: false, onnotice: () => {} });

interface WorkerCountRow {
  workers: string;
  worker_functions: string;
  queue_rows: string;
}

async function captureState(client: postgres.Sql): Promise<WorkerCountRow> {
  const [row] = await client<WorkerCountRow[]>`
    select
      (select coalesce(string_agg(worker_id::text || ':' || queue_name, ',' order by worker_id::text), '')
         from pgflow.workers) as workers,
      (select coalesce(string_agg(function_name || ':' || enabled::text, ',' order by function_name), '')
         from pgflow.worker_functions) as worker_functions,
      (select count(*)::text from pgmq.q_orders) as queue_rows
  `;
  return row;
}

const before = await captureState(sql);

const OrdersFlow = new Flow<{ order: string }>({ slug: 'Orders' }).step(
  { slug: 'saveItem' },
  () => null,
);

const worker = createFlowWorker(
  OrdersFlow,
  { sql, maxConcurrent: 1, batchSize: 10 },
  () => fakeLogger,
  createTestPlatformAdapter(sql),
);

try {
  await worker.startOnlyOnce({
    edgeFunctionName: 'orders_worker',
    workerId: crypto.randomUUID(),
  });
  console.error('startup_probe: startup unexpectedly succeeded on the old database');
  Deno.exit(1);
} catch (error) {
  const mismatch = error instanceof QueueProtocolMismatchError;
  if (!mismatch) {
    console.error('startup_probe: expected QueueProtocolMismatchError, got:', error);
    Deno.exit(1);
  }
  console.log('startup_probe: protocol mismatch as required');
  console.log(String(error).split('\n')[0]);
} finally {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await sql.end();
}

// Reconnect: the old database must be untouched after the failed startup.
// captureState runs on the fresh connection, so a CONNECTION_ENDED rejection
// here is a real verification failure and must fail the probe. The cleanup
// handler is removed first so it can no longer suppress any rejection.
globalThis.removeEventListener('unhandledrejection', suppressConnectionEnded);
const verify = postgres(dbUrl, { prepare: false, onnotice: () => {} });
try {
  const after = await captureState(verify);
  if (
    after.workers !== before.workers ||
    after.worker_functions !== before.worker_functions ||
    after.queue_rows !== before.queue_rows
  ) {
    console.error('startup_probe: state changed after failed startup', { before, after });
    Deno.exit(1);
  }
  console.log('startup_probe: PASS (mismatch before registration, state unchanged)');
} finally {
  await verify.end();
}

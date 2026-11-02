import { assertEquals, assert } from '@std/assert';
import { delay } from '@std/async';
import { FakeTime } from '@std/testing/time';
import postgres from 'postgres';
import { Flow } from '@pgflow/dsl';
import { SupabasePlatformAdapter } from '../../src/platform/SupabasePlatformAdapter.ts';
import { createFlowWorker } from '../../src/flow/createFlowWorker.ts';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { withPgNoTransaction } from '../db.ts';
import { integrationConfig } from '../config.ts';
import { waitForRunCompletion } from './flow/_testHelpers.ts';

const functionName = 'invocation-test';
const flow = new Flow({ slug: 'invocation_test' }).step(
  { slug: 'one' }, () => 'done'
);

async function runtime(options: { local?: boolean; queue?: boolean; loseAcknowledgement?: boolean; hangCompilation?: boolean; holdReconciliation?: boolean; maxConnections?: number } = {}) {
  let handle!: (req: Request) => Response | Promise<Response>;
  let loseAcknowledgement = options.loseAcknowledgement ?? false;
  let hangCompilation = options.hangCompilation ?? false;
  let holdReconciliation = options.holdReconciliation ?? false;
  let releaseReconciliation = () => {};
  let reconciliationHeld = () => {};
  const reconciled = new Promise<void>((resolve) => { reconciliationHeld = resolve; });
  let releaseCompilation = () => {};
  let compilationHeld = () => {};
  const held = new Promise<void>((resolve) => { compilationHeld = resolve; });
  const connection = postgres(integrationConfig.dbUrl, {
    prepare: false,
    max: options.maxConnections,
    connection: {
      'app.settings.jwt_secret': options.local
        ? 'super-secret-jwt-token-with-at-least-32-characters-long' : 'production-secret',
    },
  });
  // Fault injection at the database transport boundary: commit the real
  // acceptance, then lose its response before the caller observes it.
  let loseOnCommit = false;
  let hangOnCommit = false;
  function instrument<T extends postgres.Sql | postgres.TransactionSql>(client: T): T {
    return new Proxy(client, {
      get(target, key, receiver) {
        if (key === 'begin') return async (callback: (tx: postgres.TransactionSql) => Promise<unknown>) => {
          const rows = await (target as postgres.Sql).begin((tx) => callback(instrument(tx)));
          if (loseOnCommit) {
            loseOnCommit = false;
            throw new Error('acknowledgement response lost');
          }
          if (hangOnCommit) {
            hangOnCommit = false;
            return new Promise((resolve) => {
              releaseCompilation = () => resolve(rows);
              compilationHeld();
            });
          }
          return rows;
        };
        return Reflect.get(target, key, receiver);
      },
      apply(target, thisArg, args) {
        const query = args[0].join('');
        if (hangCompilation && query.includes('ensure_flow_compiled')) {
          hangCompilation = false;
          hangOnCommit = true;
        }
        if (loseAcknowledgement && query.includes('accept_worker_invocation')) {
          loseAcknowledgement = false;
          loseOnCommit = true;
        }
        const result = Reflect.apply(target, thisArg, args);
        if (holdReconciliation && query.includes('reconcile_worker_invocation')) {
          holdReconciliation = false;
          return result.then((rows: unknown) => new Promise((resolve) => {
            releaseReconciliation = () => resolve(rows);
            reconciliationHeld();
          }));
        }
        return result;
      },
    });
  }
  const sql = instrument(connection);
  const adapter = new SupabasePlatformAdapter({ sql }, {
    getEnv: () => ({
      SUPABASE_URL: options.local ? 'http://kong:8000' : 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      SB_EXECUTION_ID: crypto.randomUUID(),
      EDGE_WORKER_LOG_LEVEL: 'error',
    }),
    serve: (handler) => { handle = handler; },
    onShutdown: () => {},
    extendLifetime: () => {},
  });
  if (options.hangCompilation || options.maxConnections === 1) await connection`select 1`;
  await adapter.startWorker((logger) => options.queue
    ? createQueueWorker(() => {}, { sql, queueName: flow.slug, maxPollSeconds: 1 }, logger, adapter)
    : createFlowWorker(flow, { sql, maxPollSeconds: 1, pollIntervalMs: 10 }, logger, adapter)
  );
  return {
    adapter,
    held,
    reconciled,
    releaseReconciliation: () => releaseReconciliation(),
    releaseCompilation: () => releaseCompilation(),
    request: (invocationId?: string, auth = true, name = functionName) => handle(new Request(`https://test/${name}`, {
      method: 'POST',
      headers: { ...(auth ? { Authorization: 'Bearer test-service-key' } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(invocationId === undefined ? {} : { invocation_id: invocationId }),
    })),
  };
}

Deno.test('independent runtimes cannot start two workers for duplicate delivery',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    await sql`select pgflow.create_flow(${flow.slug})`;
    await sql`select pgflow.add_step(${flow.slug}, 'one')`;
    await sql`select pgflow.track_worker_function(${functionName})`;
    const [{ id }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
    const runtimes = await Promise.all([runtime(), runtime({ queue: true })]);
    try {
      const responses = await Promise.all(runtimes.map((r) => r.request(id)));
      assertEquals(responses.map((r) => r.status).sort(), [200, 409]);
      const [{ count }] = await sql`
        select count(*)::int as count from pgflow.workers where function_name = ${functionName}
      `;
      assertEquals(count, 1);
    } finally {
      await Promise.all(runtimes.map((r) => r.adapter.stopWorker()));
      await sql`delete from pgflow.workers where function_name = ${functionName}`;
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

Deno.test('a delayed reconciliation cannot replace the worker started by a concurrent request',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    await sql`select pgflow.track_worker_function(${functionName})`;
    const [{ id }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
    const r = await runtime({ holdReconciliation: true });
    const delayed = Promise.resolve(r.request(id));
    try {
      await r.reconciled;
      const first = await r.request(id);
      assertEquals(first.status, 200);
      const started = await first.json();
      r.releaseReconciliation();
      const duplicate = await delayed;
      assertEquals(duplicate.status, 200);
      assertEquals(await duplicate.json(), { ...started, status: 'running' });
      const [{ run_id }] = await sql`select run_id from pgflow.start_flow(${flow.slug}, '{}'::jsonb)`;
      const completed = await waitForRunCompletion(sql, run_id, { timeoutMs: 5_000, pollIntervalMs: 20 });
      assertEquals(completed.status, 'completed');
      assertEquals(completed.output, { one: 'done' });
    } finally {
      r.releaseReconciliation();
      await delayed;
      await r.adapter.stopWorker();
      await sql`delete from pgflow.workers where function_name = ${functionName}`;
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

async function ensure(sql: postgres.Sql) {
  return await sql.begin(async (tx) => {
    await tx`set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long'`;
    return await tx`select * from pgflow.ensure_workers()`;
  });
}

async function waitForCompilation(sql: postgres.Sql) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [{ waiting }] = await sql`
      select exists (
        select 1 from pg_stat_activity
        where wait_event = 'advisory' and query like '%ensure_flow_compiled%'
      ) as waiting
    `;
    if (waiting) return;
    await delay(10);
  }
  throw new Error('Startup did not reach the compilation barrier');
}

Deno.test('initialization beyond debounce keeps one pending enqueue across concurrent cron calls',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    await sql`select pgflow.track_worker_function(${functionName})`;
    await sql`update pgflow.worker_functions set debounce = interval '1 second' where function_name = ${functionName}`;
    const queued = await ensure(sql);
    assertEquals(queued.length, 1);
    const [{ invocation_id: id }] = await sql`select invocation_id from pgflow.worker_functions where function_name = ${functionName}`;
    const lock = await sql.reserve();
    await lock`select pg_advisory_lock(1, hashtext(${flow.slug}))`;
    const r = await runtime();
    const response = r.request(id);
    try {
      await waitForCompilation(sql);
      await sql`select pg_sleep(1.05)`;
      const [{ pending }] = await sql`
        select invocation_status = 'pending' and invocation_expires_at > clock_timestamp()
          and last_invoked_at < clock_timestamp() - debounce as pending
        from pgflow.worker_functions where function_name = ${functionName}
      `;
      assert(pending, 'receipt must remain pending beyond debounce until readiness');
      const retries = await Promise.all(Array.from({ length: 8 }, () => ensure(sql)));
      assertEquals(retries.flat().length, 0, 'concurrent cron calls cannot enqueue while initialization is held');
      const [{ count }] = await sql`select count(*)::int as count from pgflow.workers where function_name = ${functionName}`;
      assertEquals(count, 0, 'receipt alone must not register an unready worker');
    } finally {
      await lock`select pg_advisory_unlock(1, hashtext(${flow.slug}))`;
      lock.release();
      assertEquals((await response).status, 200);
      await r.adapter.stopWorker();
      await sql`delete from pgflow.workers where function_name = ${functionName}`;
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

Deno.test('concurrent cron transactions reserve one request per distinct replica',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    for (const name of [functionName, `${functionName}-b`]) {
      await sql`select pgflow.track_worker_function(${name})`;
    }
    try {
      const batches = await Promise.all(Array.from({ length: 8 }, () => ensure(sql)));
      assertEquals(batches.flat().map((row) => row.function_name).sort(), [functionName, `${functionName}-b`]);
      const [{ count }] = await sql`select count(distinct invocation_id)::int as count from pgflow.worker_functions`;
      assertEquals(count, 2);
    } finally {
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

Deno.test('lost readiness response recovers the committed worker and duplicate delivery does not start another loop',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    await sql`select pgflow.track_worker_function(${functionName})`;
    const [{ id }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
    const r = await runtime({ loseAcknowledgement: true });
    try {
      const first = await r.request(id);
      assertEquals(first.status, 200);
      const started = await first.json();
      const again = await r.request(id);
      assertEquals(again.status, 200);
      assertEquals(await again.json(), { ...started, status: 'running' });
      const [{ count }] = await sql`select count(*)::int as count from pgflow.workers where function_name = ${functionName}`;
      assertEquals(count, 1);
    } finally {
      await r.adapter.stopWorker();
      await sql`delete from pgflow.workers where function_name = ${functionName}`;
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

Deno.test('expiry or supersession during initialization rejects readiness and the same runtime handles the retry',
  withPgNoTransaction(async (sql) => {
    for (const supersede of [false, true]) {
      await sql`select pgflow_tests.reset_db()`;
      await sql`select pgflow.track_worker_function(${functionName})`;
      const [{ id }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
      const r = await runtime();
      const lock = await sql.reserve();
      await lock`select pg_advisory_lock(1, hashtext(${flow.slug}))`;
      const response = r.request(id);
      let newerId: string | undefined;
      try {
        await waitForCompilation(sql);
        await sql`update pgflow.worker_functions set invocation_expires_at = clock_timestamp() - interval '1 second',
          last_invoked_at = clock_timestamp() - interval '10 seconds' where function_name = ${functionName}`;
        if (supersede) {
          const [newer] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
          newerId = newer.id;
        }
      } finally {
        await lock`select pg_advisory_unlock(1, hashtext(${flow.slug}))`;
        lock.release();
      }
      try {
        assertEquals((await response).status, 409, 'final readiness must revalidate the token');
        assertEquals((await r.request(id)).status, 409, 'late delivery cannot revive the old token');
        const [{ count }] = await sql`select count(*)::int as count from pgflow.workers where function_name = ${functionName}`;
        assertEquals(count, 0);
        if (supersede) {
          const [pending] = await sql`select invocation_id, invocation_status from pgflow.worker_functions where function_name = ${functionName}`;
          assertEquals(pending.invocation_id, newerId);
          assertEquals(pending.invocation_status, 'pending', 'old failure must not dismiss the newer invocation');
        } else {
          const [newer] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
          newerId = newer.id;
        }
        assertEquals((await r.request(newerId)).status, 200, 'retry needs neither runtime eviction nor redeployment');
      } finally {
        await r.adapter.stopWorker();
        await sql`delete from pgflow.workers where function_name = ${functionName}`;
        await sql`select pgflow_tests.reset_db()`;
      }
    }
  })
);

Deno.test('startup SQL timeout frees a single-connection runtime without redeployment',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    await sql`select pgflow.track_worker_function(${functionName})`;
    const [{ id }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
    const lock = await sql.reserve();
    await lock`select pg_advisory_lock(1, hashtext(${flow.slug}))`;
    const r = await runtime({ maxConnections: 1 });
    const response = Promise.resolve(r.request(id));
    const deadline = new AbortController();
    try {
      try {
        await waitForCompilation(sql);
        const settled = await Promise.race([
          response.then(() => true),
          delay(65_000, { signal: deadline.signal }).then(() => false).catch(() => false),
        ]);
        assert(settled, 'SQL startup must release its connection without waiting for the compilation lock');
        assertEquals((await response).status, 500);
      } finally {
        deadline.abort();
        await lock`select pg_advisory_unlock(1, hashtext(${flow.slug}))`;
        lock.release();
        await response;
      }
      await sql`update pgflow.worker_functions set last_invoked_at = clock_timestamp() - interval '10 seconds' where function_name = ${functionName}`;
      const [{ id: next }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
      assertEquals((await r.request(next)).status, 200);
    } finally {
      await r.adapter.stopWorker();
      await sql`delete from pgflow.workers where function_name = ${functionName}`;
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

Deno.test('hung initialization releases the runtime for a later invocation without redeployment',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    const r = await runtime({ hangCompilation: true });
    await sql`select pgflow.track_worker_function(${functionName})`;
    const [{ id: firstId }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
    const realSetTimeout = globalThis.setTimeout;
    const time = new FakeTime();
    let restored = false;
    const first = Promise.resolve(r.request(firstId));
    let settled = false;
    let held = false;
    first.then(() => { settled = true; });
    r.held.then(() => { held = true; });
    try {
      // Pump mocked timers while real SQL I/O reaches the transport barrier.
      for (let i = 0; i < 100 && !held; i++) {
        await time.tickAsync(1);
        await new Promise((resolve) => realSetTimeout(resolve, 10));
      }
      assert(held, 'initialization must reach the transport barrier');
      await time.tickAsync(60_000);
      time.restore();
      restored = true;
      // Dismissal uses real SQL I/O after the local watchdog fires.
      for (let i = 0; i < 100 && !settled; i++) await delay(10);
      assert(settled, 'a hung startup must not own the runtime startup guard forever');
      assertEquals((await first).status, 500);
      // Database clock, not the local watchdog, authorizes the new reservation.
      await sql`update pgflow.worker_functions set last_invoked_at = clock_timestamp() - interval '10 seconds' where function_name = ${functionName}`;
      const [{ id }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
      assert(id);
      const next = await r.request(id);
      assertEquals(next.status, 200, 'the surviving runtime accepts a later invocation before the old initialization settles');
      r.releaseCompilation();
      const [{ run_id }] = await sql`select run_id from pgflow.start_flow(${flow.slug}, '{}'::jsonb)`;
      const completed = await waitForRunCompletion(sql, run_id, { timeoutMs: 5_000, pollIntervalMs: 20 });
      assertEquals(completed.status, 'completed');
      assertEquals(completed.output, { one: 'done' });
      const [{ count }] = await sql`select count(*)::int as count from pgflow.workers where function_name = ${functionName}`;
      assertEquals(count, 1);
    } finally {
      if (!restored) time.restore();
      r.releaseCompilation();
      await first;
      await r.adapter.stopWorker();
      await sql`delete from pgflow.workers where function_name = ${functionName}`;
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

Deno.test('startup failure dismisses the token and a later request recovers in the same runtime',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    await sql`select pgflow.create_flow(${flow.slug})`;
    await sql`select pgflow.add_step(${flow.slug}, 'different')`;
    await sql`select pgflow.track_worker_function(${functionName})`;
    const [{ id }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
    const r = await runtime();
    try {
      assertEquals((await r.request(id)).status, 500);
      const [failed] = await sql`select invocation_status, invocation_error from pgflow.worker_functions where function_name = ${functionName}`;
      assertEquals(failed.invocation_status, 'failed');
      assert(failed.invocation_error.includes('mismatch'));
      assertEquals((await r.request(id)).status, 409, 'dismissed tokens cannot authorize processing');
      await sql`select pgflow.delete_flow_and_data(${flow.slug})`;
      await sql`update pgflow.worker_functions set last_invoked_at = clock_timestamp() - interval '10 seconds' where function_name = ${functionName}`;
      const [{ id: retry }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
      assertEquals((await r.request(retry)).status, 200);
    } finally {
      await r.adapter.stopWorker();
      await sql`delete from pgflow.workers where function_name = ${functionName}`;
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

Deno.test('authentication, manual startup and local development preserve the handshake and registration settings',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    const r = await runtime();
    const local = await runtime({ local: true });
    try {
      assertEquals((await r.request(undefined, false)).status, 401);
      assertEquals((await r.request('not-a-uuid')).status, 400);
      const [{ count }] = await sql`select count(*)::int as count from pgflow.worker_functions`;
      assertEquals(count, 0, 'unauthenticated and malformed requests cannot reserve');
      await sql`select pgflow.track_worker_function(${functionName})`;
      await sql`update pgflow.worker_functions set enabled = false where function_name = ${functionName}`;
      assertEquals((await r.request()).status, 409);
      await sql`update pgflow.worker_functions set enabled = true, start_mode = 'process' where function_name = ${functionName}`;
      assertEquals((await r.request()).status, 409);
      const [process] = await sql`select start_mode, invocation_id from pgflow.worker_functions where function_name = ${functionName}`;
      assertEquals(process.start_mode, 'process');
      assertEquals(process.invocation_id, null, 'manual requests cannot turn process workers into HTTP workers');
      await sql`delete from pgflow.worker_functions where function_name = ${functionName}`;
      const replies = await Promise.all([r.request(), local.request(undefined, false)]);
      assertEquals(replies.map((reply) => reply.status).sort(), [200, 409], 'manual/local starts share SQL reservations');
      const [{ invocation_status }] = await sql`select invocation_status from pgflow.worker_functions where function_name = ${functionName}`;
      assertEquals(invocation_status, 'ready');
    } finally {
      await Promise.all([r.adapter.stopWorker(), local.adapter.stopWorker()]);
      await sql`delete from pgflow.workers where function_name = ${functionName}`;
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

Deno.test('a healthy surviving runtime acknowledges a later valid invocation without another worker',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db()`;
    const r = await runtime();
    try {
      const first = await r.request();
      assertEquals(first.status, 200);
      const started = await first.json();
      // Heartbeat loss can schedule a replacement (#697 owns lifetime fencing).
      await sql`update pgflow.workers set last_heartbeat_at = clock_timestamp() - interval '10 seconds' where function_name = ${functionName}`;
      await sql`update pgflow.worker_functions set last_invoked_at = clock_timestamp() - interval '10 seconds' where function_name = ${functionName}`;
      const [{ id }] = await sql`select pgflow.reserve_worker_invocation(${functionName}) as id`;
      assert(id);
      await sql`update pgflow.workers set last_heartbeat_at = clock_timestamp() where function_name = ${functionName}`;
      const ack = await r.request(id);
      assertEquals(ack.status, 200);
      assertEquals((await ack.json()).workerId, started.workerId);
      assertEquals((await r.request(started.invocationId)).status, 409, 'superseded requests fail even in a ready runtime');
      assertEquals((await r.request(id)).status, 200, 'duplicate acknowledgement is idempotent');
      assertEquals((await ensure(sql)).length, 0, 'ready is not a reason to invoke again');
      const [{ count }] = await sql`select count(*)::int as count from pgflow.workers where function_name = ${functionName}`;
      assertEquals(count, 1);
    } finally {
      await r.adapter.stopWorker();
      await sql`delete from pgflow.workers where function_name = ${functionName}`;
      await sql`select pgflow_tests.reset_db()`;
    }
  })
);

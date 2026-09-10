import { assertRejects, assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { createFlowWorker } from '../../../src/flow/createFlowWorker.ts';
import { QueueProtocolMismatchError } from '../../../src/flow/errors.ts';
import { createTestPlatformAdapter } from '../_helpers.ts';
import { fakeLogger } from '../../fakes.ts';
import type { postgres } from '../../sql.ts';

// #650 startup compatibility matrix (migrated database side):
//   1. migrated DB + new plain worker  -> compiles/verifies, registers the
//      canonical queue, handlers run with exact camelCase step identity;
//   2. migrated DB + old-looking handshake answer -> rejected before
//      registration (the result is untrusted until protocol/queue checks
//      pass);
//   3. migrated DB + released 0.16.0 worker startup call -> the two-argument
//      ensure_flow_compiled lookup fails before any worker/function
//      registration or polling.
// The opposite direction (0.16.0 database + new worker) runs in the
// upgrade_queue_fixture startup probe, not against this stack.

const OrdersFlow = new Flow<{ order: string }>({ slug: 'StartupOrders' }).step(
  { slug: 'saveItem' },
  () => 'saved'
);

Deno.test(
  'new worker verifies and registers the canonical queue',
  withPgNoTransaction(async (sql: postgres.Sql) => {
    await sql`select pgflow_tests.reset_db()`;

    const worker = createFlowWorker(
      OrdersFlow,
      { sql, maxConcurrent: 1, batchSize: 5, maxPollSeconds: 1, pollIntervalMs: 100 },
      () => fakeLogger,
      createTestPlatformAdapter(sql)
    );
    await worker.startOnlyOnce({
      edgeFunctionName: 'startup_orders_worker',
      workerId: crypto.randomUUID(),
    });

    try {
      // Canonical queue was provisioned through the new handshake and the
      // worker registered against it with the lowercase physical name.
      const [registered] = await sql<{ queue_name: string }[]>`
        select queue_name from pgflow.workers
        where function_name = 'startup_orders_worker'
      `;
      assertEquals(registered.queue_name, 'startuporders');

      // Exact camelCase step identity survives compilation.
      const steps = await sql<{ step_slug: string; queue_name: string }[]>`
        select step_slug, queue_name from pgflow.steps
        where flow_slug = 'StartupOrders'
      `;
      assertEquals(steps.length, 1);
      assertEquals(steps[0].step_slug, 'saveItem');
      assertEquals(steps[0].queue_name, 'startuporders');

      // A run executes through the canonical route.
      await sql`
        select run_id from pgflow.start_flow('StartupOrders', '{"order":"o1"}'::jsonb)
      `;
      const [{ queued }] = await sql<{ queued: number }[]>`
        select count(*)::int as queued from pgflow.step_tasks
        where flow_slug = 'StartupOrders' and queue_name = 'startuporders'
      `;
      assertEquals(queued, 1, 'task snapshotted the canonical queue');
    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'new worker rejects an old-looking handshake answer before registration',
  withPgNoTransaction(async (sql: postgres.Sql) => {
    await sql`select pgflow_tests.reset_db()`;

    // Tamper with the database answer so it looks like a pre-#650 result:
    // no protocol_version, no queue_name. The worker must not trust it.
    // The real handshake is restored afterwards: reset_db clears rows only.
    const restoreUrl = new URL(
      '../../../../core/schemas/0100_function_ensure_flow_compiled.sql',
      import.meta.url
    );
    try {
      await sql`
        create or replace function pgflow.ensure_flow_compiled(
          flow_slug text, shape jsonb, worker_protocol jsonb
        ) returns jsonb language sql as $fn$
          select jsonb_build_object('status', 'verified', 'differences', '[]'::jsonb)
        $fn$;
      `;

    const worker = createFlowWorker(
      OrdersFlow,
      { sql, maxConcurrent: 1, batchSize: 5, maxPollSeconds: 1, pollIntervalMs: 100 },
      () => fakeLogger,
      createTestPlatformAdapter(sql)
    );

    await assertRejects(
      () =>
        worker.startOnlyOnce({
          edgeFunctionName: 'startup_orders_tampered',
          workerId: crypto.randomUUID(),
        }),
      QueueProtocolMismatchError
    );

      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from pgflow.workers
        where function_name = 'startup_orders_tampered'
      `;
      assertEquals(n, 0, 'no worker registered from an untrusted answer');
    } finally {
      await sql.file(restoreUrl);
    }
  })
);

Deno.test(
  'released 0.16.0 startup call fails before registration on a migrated database',
  withPgNoTransaction(async (sql: postgres.Sql) => {
    await sql`select pgflow_tests.reset_db()`;

    // Ordinary SQL signature probe: the fast explanation of the failure.
    const err = await sql`select pgflow.ensure_flow_compiled('x', '{}'::jsonb)`
      .catch((e: Error) => e);
    assertEquals(
      err instanceof Error && /function pgflow.ensure_flow_compiled.*does not exist/i.test(err.message),
      true,
      `two-argument lookup must fail: ${String(err)}`
    );

    // The real released worker through pinned test-only fixture imports.
    // These are fixture dependencies, not restored production APIs (#650).
    // A missing import or export fails the test: the released-worker
    // compatibility direction must never silently pass as untested.
    const internal = await import('npm:@pgflow/edge-worker@0.16.0/_internal');
    // The published _internal entry nests createFlowWorker (default/core/flow).
    const carrier = (internal as {
      default?: { createFlowWorker?: unknown };
      core?: { createFlowWorker?: unknown };
      flow?: { createFlowWorker?: unknown };
    });
    const releasedCreate = carrier.default?.createFlowWorker
      ?? carrier.core?.createFlowWorker
      ?? carrier.flow?.createFlowWorker;
    const dsl = await import('npm:@pgflow/dsl@0.16.0');
    const releasedFlow = (dsl as { Flow?: unknown }).Flow;
    assertEquals(
      typeof releasedCreate === 'function' && typeof releasedFlow === 'function',
      true,
      'pinned 0.16.0 fixture exports must expose createFlowWorker and Flow'
    );

    {
      const OldFlow = releasedFlow as new (opts: { slug: string }) => {
        step: (o: { slug: string }, h: () => unknown) => unknown;
      };
      const oldFlow = new OldFlow({ slug: 'StartupOrders' }).step(
        { slug: 'saveItem' },
        () => 'saved'
      );
      const oldCreate = releasedCreate as (
        flow: unknown,
        opts: Record<string, unknown>,
        logger: () => unknown,
        adapter: unknown
      ) => { startOnlyOnce: (b: { edgeFunctionName: string; workerId: string }) => Promise<void> };

      const oldWorker = oldCreate(
        oldFlow,
        { sql, maxConcurrent: 1, batchSize: 5 },
        () => fakeLogger,
        createTestPlatformAdapter(sql)
      );

      const [beforeWorkers] = await sql<{ n: number }[]>`
        select count(*)::int as n from pgflow.workers
      `;
      const [beforeFunctions] = await sql<{ n: number }[]>`
        select count(*)::int as n from pgflow.worker_functions
      `;

      let releasedError: unknown;
      try {
        await oldWorker.startOnlyOnce({
          edgeFunctionName: 'startup_orders_old_worker',
          workerId: crypto.randomUUID(),
        });
      } catch (e) {
        releasedError = e;
      }
      // The released worker must fail at the removed two-argument startup
      // signature itself - not at an adapter, fixture, or unrelated error.
      assertEquals(
        releasedError instanceof Error &&
          /function pgflow\.ensure_flow_compiled\(unknown, jsonb\) does not exist/
            .test(releasedError.message),
        true,
        `released 0.16.0 startup must fail at the removed signature: ${String(releasedError)}`
      );

      const [afterWorkers] = await sql<{ n: number }[]>`
        select count(*)::int as n from pgflow.workers
      `;
      const [afterFunctions] = await sql<{ n: number }[]>`
        select count(*)::int as n from pgflow.worker_functions
      `;
      assertEquals(afterWorkers.n, beforeWorkers.n, 'no worker registered');
      assertEquals(afterFunctions.n, beforeFunctions.n, 'no function registered');
    }
  })
);


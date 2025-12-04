import { assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { delay } from '@std/async';
import { createFlowWorker } from '../../../src/flow/createFlowWorker.ts';
import { createTestPlatformAdapter } from '../_helpers.ts';
import type { postgres } from '../../sql.ts';
import postgresLib from 'postgres';
import { integrationConfig } from '../../config.ts';

// Define a minimal test flow
const TestCompilationFlow = new Flow<{ value: number }>({ slug: 'test_compilation_flow' })
  .step({ slug: 'double' }, async (input) => {
    await delay(1);
    return input.run.value * 2;
  });

function createLogger(module: string) {
  return {
    debug: console.log.bind(console, `[${module}]`),
    info: console.log.bind(console, `[${module}]`),
    warn: console.warn.bind(console, `[${module}]`),
    error: console.error.bind(console, `[${module}]`),
  };
}

function createPlatformAdapterWithLocalEnv(
  sql: postgres.Sql,
  isLocal: boolean
) {
  const baseAdapter = createTestPlatformAdapter(sql);

  return {
    ...baseAdapter,
    get isLocalEnvironment() { return isLocal; },
  };
}

Deno.test(
  'compiles new flow on worker startup',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    // Verify flow doesn't exist
    const [flowBefore] = await sql`
      SELECT * FROM pgflow.flows WHERE flow_slug = 'test_compilation_flow'
    `;
    assertEquals(flowBefore, undefined, 'Flow should not exist before worker startup');

    // Create worker (compilation happens during acknowledgeStart)
    const worker = createFlowWorker(
      TestCompilationFlow,
      {
        sql,
        maxConcurrent: 1,
        batchSize: 10,
        maxPollSeconds: 1,
        pollIntervalMs: 200,
      },
      createLogger,
      createPlatformAdapterWithLocalEnv(sql, false)
    );

    try {
      // Start worker - this triggers compilation
      worker.startOnlyOnce({
        edgeFunctionName: 'test_compilation',
        workerId: crypto.randomUUID(),
      });

      // Give time for startup to complete
      await delay(100);

      // Verify flow was created
      const [flowAfter] = await sql`
        SELECT * FROM pgflow.flows WHERE flow_slug = 'test_compilation_flow'
      `;
      assertEquals(flowAfter?.flow_slug, 'test_compilation_flow', 'Flow should be created');

      // Verify step was created
      const steps = await sql`
        SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_compilation_flow' ORDER BY step_slug
      `;
      assertEquals(steps.length, 1, 'Should have 1 step');
      assertEquals(steps[0].step_slug, 'double', 'Step should be "double"');
    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'verifies existing matching flow on worker startup',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    // Pre-create the flow with matching structure
    await sql`SELECT pgflow.create_flow('test_compilation_flow')`;
    await sql`SELECT pgflow.add_step('test_compilation_flow', 'double')`;

    // Verify flow exists
    const [flowBefore] = await sql`
      SELECT * FROM pgflow.flows WHERE flow_slug = 'test_compilation_flow'
    `;
    assertEquals(flowBefore?.flow_slug, 'test_compilation_flow', 'Flow should exist');

    // Create and start worker
    const worker = createFlowWorker(
      TestCompilationFlow,
      {
        sql,
        maxConcurrent: 1,
        batchSize: 10,
        maxPollSeconds: 1,
        pollIntervalMs: 200,
      },
      createLogger,
      createPlatformAdapterWithLocalEnv(sql, false)
    );

    try {
      // Start worker - should verify without error
      worker.startOnlyOnce({
        edgeFunctionName: 'test_compilation',
        workerId: crypto.randomUUID(),
      });

      // Give time for startup to complete
      await delay(100);

      // Verify flow still exists (was not deleted/recreated)
      const [flowAfter] = await sql`
        SELECT * FROM pgflow.flows WHERE flow_slug = 'test_compilation_flow'
      `;
      assertEquals(flowAfter?.flow_slug, 'test_compilation_flow', 'Flow should still exist');
    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'throws FlowShapeMismatchError on mismatch in production mode',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    // Pre-create flow with DIFFERENT structure than what worker expects
    await sql`SELECT pgflow.create_flow('test_compilation_flow')`;
    await sql`SELECT pgflow.add_step('test_compilation_flow', 'double')`;
    await sql`SELECT pgflow.add_step('test_compilation_flow', 'different_step', deps_slugs => ARRAY['double']::text[])`;

    // Use isLocal: false to simulate production mode
    const platformAdapter = createPlatformAdapterWithLocalEnv(sql, false);

    const worker = createFlowWorker(
      TestCompilationFlow, // Has only 'double' step
      {
        sql,
        maxConcurrent: 1,
        batchSize: 10,
        maxPollSeconds: 1,
        pollIntervalMs: 200,
      },
      createLogger,
      platformAdapter
    );

    // Set up unhandled rejection handler to capture the error
    const caughtErrors: Error[] = [];
    const errorHandler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      caughtErrors.push(event.reason as Error);
    };
    globalThis.addEventListener('unhandledrejection', errorHandler);

    try {
      worker.startOnlyOnce({
        edgeFunctionName: 'test_compilation',
        workerId: crypto.randomUUID(),
      });

      // Give time for startup to fail
      await delay(200);

      // Verify error was thrown
      assertEquals(caughtErrors.length > 0, true, 'Should have caught an error');
      const caughtError = caughtErrors[0];
      assertEquals(caughtError.name, 'FlowShapeMismatchError', 'Error should be FlowShapeMismatchError');
      assertEquals(
        caughtError.message.includes('shape mismatch'),
        true,
        'Error message should mention mismatch'
      );
    } finally {
      globalThis.removeEventListener('unhandledrejection', errorHandler);
      try {
        await worker.stop();
      } catch {
        // Ignore stop errors since worker may have failed to start
      }
    }
  })
);

Deno.test(
  'recompiles flow on mismatch in development mode (local Supabase)',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    // Pre-create flow with DIFFERENT structure
    await sql`SELECT pgflow.create_flow('test_compilation_flow')`;
    await sql`SELECT pgflow.add_step('test_compilation_flow', 'old_step')`;

    // Use isLocal: true to simulate development mode
    const platformAdapter = createPlatformAdapterWithLocalEnv(sql, true);

    const worker = createFlowWorker(
      TestCompilationFlow, // Has 'double' step, not 'old_step'
      {
        sql,
        maxConcurrent: 1,
        batchSize: 10,
        maxPollSeconds: 1,
        pollIntervalMs: 200,
      },
      createLogger,
      platformAdapter
    );

    try {
      worker.startOnlyOnce({
        edgeFunctionName: 'test_compilation',
        workerId: crypto.randomUUID(),
      });

      // Give time for startup and recompilation
      await delay(200);

      // Verify flow was recompiled with new structure
      const steps = await sql`
        SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_compilation_flow' ORDER BY step_slug
      `;
      assertEquals(steps.length, 1, 'Should have 1 step after recompilation');
      assertEquals(steps[0].step_slug, 'double', 'Step should be "double" after recompilation');
    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'handles concurrent compilation with advisory locks (stress test)',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const CONCURRENT = 50; // 50 separate connections
    const flowSlug = `concurrent_test_${Date.now()}`;
    const shape = {
      steps: [{ slug: 'step1', stepType: 'single', dependencies: [] }],
    };

    // Create N SEPARATE connections (critical for true concurrency)
    const connections = await Promise.all(
      Array(CONCURRENT)
        .fill(null)
        .map(() => postgresLib(integrationConfig.dbUrl, { prepare: false }))
    );

    try {
      // Fire all compilations simultaneously on separate connections
      // Note: Must use conn.json() for proper jsonb parameter passing
      const results = await Promise.all(
        connections.map((conn) =>
          conn`SELECT pgflow.ensure_flow_compiled(
            ${flowSlug},
            ${conn.json(shape)},
            'production'
          ) as result`
        )
      );

      // Parse results
      const statuses = results.map((r) => r[0].result.status);
      const compiled = statuses.filter((s) => s === 'compiled');
      const verified = statuses.filter((s) => s === 'verified');

      // Assert: exactly 1 compiled, rest verified
      assertEquals(compiled.length, 1, 'Exactly 1 should compile');
      assertEquals(verified.length, CONCURRENT - 1, 'Rest should verify');

      // Assert: exactly 1 flow and 1 step in DB
      const [flowCount] = await sql`
        SELECT COUNT(*)::int as count FROM pgflow.flows
        WHERE flow_slug = ${flowSlug}
      `;
      const [stepCount] = await sql`
        SELECT COUNT(*)::int as count FROM pgflow.steps
        WHERE flow_slug = ${flowSlug}
      `;

      assertEquals(flowCount.count, 1, 'Exactly 1 flow should exist');
      assertEquals(stepCount.count, 1, 'Exactly 1 step should exist');
    } finally {
      // Cleanup
      await sql`SELECT pgflow.delete_flow_and_data(${flowSlug})`.catch(() => {});
      await Promise.all(connections.map((c) => c.end()));
    }
  })
);

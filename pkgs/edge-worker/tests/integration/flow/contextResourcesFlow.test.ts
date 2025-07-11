import { assert, assertEquals, assertExists } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl/supabase';
import { waitFor } from '../../e2e/_helpers.ts';
import { delay } from '@std/async';
import { startFlow, startWorker } from '../_helpers.ts';

// Define a flow that tests ONLY the essential context resources provided by EdgeWorker
const ContextResourcesFlow = new Flow<{ testId: number }>({
  slug: 'test_context_resources_flow',
}).step({ slug: 'verifyContextResources' }, async (_input, context) => {
  await delay(1);

  // Assert all expected context resources exist
  assertExists(context.env, 'context.env should be provided');
  assertExists(
    context.shutdownSignal,
    'context.shutdownSignal should be provided'
  );
  assertExists(context.sql, 'context.sql should be provided');
  assertExists(context.anonSupabase, 'context.anonSupabase should be provided');
  assertExists(
    context.serviceSupabase,
    'context.serviceSupabase should be provided'
  );
  assertExists(context.rawMessage, 'context.rawMessage should be provided');
  assertExists(context.stepTask, 'context.stepTask should be provided');

  // Assert correct types
  assertEquals(typeof context.env, 'object', 'env should be object');
  assert(
    context.shutdownSignal instanceof AbortSignal,
    'shutdownSignal should be AbortSignal'
  );
  assertEquals(typeof context.sql, 'function', 'sql should be function');
  assertEquals(
    typeof context.anonSupabase,
    'object',
    'anonSupabase should be object'
  );
  assertEquals(
    typeof context.serviceSupabase,
    'object',
    'serviceSupabase should be object'
  );
  assertEquals(
    typeof context.rawMessage,
    'object',
    'rawMessage should be object'
  );
  assertEquals(typeof context.stepTask, 'object', 'stepTask should be object');

  // Test that sql actually works
  const sqlTest = await context.sql`SELECT 'context_test' as result`;
  assertEquals(sqlTest[0].result, 'context_test', 'sql should be functional');

  return {
    contextResourcesVerified: true,
  };
});

Deno.test(
  'context resources are provided by real EdgeWorker to flow handlers',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const worker = startWorker(sql, ContextResourcesFlow, {
      maxConcurrent: 1,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 200,
    });

    try {
      // Create flow and steps in database
      await sql`select pgflow.create_flow('test_context_resources_flow');`;
      await sql`select pgflow.add_step('test_context_resources_flow', 'verifyContextResources');`;

      // Start a flow run with test input
      const testId = Math.floor(Math.random() * 1000);
      const flowRun = await startFlow(sql, ContextResourcesFlow, { testId });

      // Wait for the run to complete
      const polledRun = await waitFor(
        async () => {
          const [run] = await sql`
            SELECT * FROM pgflow.runs WHERE run_id = ${flowRun.run_id};
          `;

          if (run.status != 'completed' && run.status != 'failed') {
            return false;
          }

          return run;
        },
        {
          pollIntervalMs: 500,
          timeoutMs: 5000,
          description: `context resources flow run ${flowRun.run_id} to complete`,
        }
      );

      // Verify the run completed successfully - this confirms that all context assertions passed
      assertEquals(
        polledRun.status,
        'completed',
        'Context resources flow should complete successfully, indicating all context resources were provided'
      );
    } finally {
      await worker.stop();
    }
  })
);

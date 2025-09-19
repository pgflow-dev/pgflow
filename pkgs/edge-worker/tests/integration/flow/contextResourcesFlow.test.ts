import { assert, assertEquals, assertExists } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl/supabase';
import { delay } from '@std/async';
import { startFlow, startWorker } from '../_helpers.ts';
import { waitForRunCompletion, createSimpleFlow } from './_testHelpers.ts';

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
  assertExists(context.supabase, 'context.supabase should be provided');
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
    typeof context.supabase,
    'object',
    'supabase should be object'
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
      // Setup: Create flow with single step that verifies context
      await createSimpleFlow(sql, 'test_context_resources_flow', [
        { slug: 'verifyContextResources', deps: [] },
      ]);

      // Execute: Start flow and wait for completion
      const testId = Math.floor(Math.random() * 1000);
      const flowRun = await startFlow(sql, ContextResourcesFlow, { testId });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      // Verify: Run completed (context assertions passed in handler)
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

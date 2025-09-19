import { assert, assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { delay } from '@std/async';
import { startFlow, startWorker } from '../_helpers.ts';
import {
  waitForRunCompletion,
  createSimpleFlow,
  getStepStates,
  getStepTasks,
  getRunOutput,
  assertAllStepsCompleted,
  assertAllTasksCompleted,
} from './_testHelpers.ts';

// Define a minimal flow with two steps:
// 1. Convert a number to a string
// 2. Wrap the string in an array
const MinimalFlow = new Flow<number>({ slug: 'test_minimal_flow' })
  .step({ slug: 'toStringStep' }, async (input) => {
    await delay(1);
    return input.run.toString();
  })
  .step(
    { slug: 'wrapInArrayStep', dependsOn: ['toStringStep'] },
    async (input) => {
      await delay(1);
      return [input.toStringStep];
    }
  );

Deno.test(
  'minimal flow executes successfully',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const worker = startWorker(sql, MinimalFlow, {
      maxConcurrent: 1,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 200,
    });

    try {
      // Setup: Create flow with two dependent steps
      await createSimpleFlow(sql, 'test_minimal_flow', [
        { slug: 'toStringStep', deps: [] },
        { slug: 'wrapInArrayStep', deps: ['toStringStep'] },
      ]);

      // Execute: Start flow with input value 42
      const flowRun = await startFlow(sql, MinimalFlow, 42);
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      // Verify: Run completed successfully
      assert(polledRun.status === 'completed', 'Run should be completed');

      // Verify: All steps completed
      const stepStates = await getStepStates(sql, flowRun.run_id);
      assertEquals(stepStates.length, 2, 'Should have 2 step states');
      assertAllStepsCompleted(stepStates);

      // Verify: All tasks completed
      const stepTasks = await getStepTasks(sql, flowRun.run_id);
      assertEquals(stepTasks.length, 2, 'Should have 2 step tasks');
      assertAllTasksCompleted(stepTasks);

      // Verify: Final output matches expected ["42"]
      const finalRun = await getRunOutput(sql, flowRun.run_id);
      assertEquals(finalRun.status, 'completed', 'Run should be completed');
      assertEquals(
        finalRun.output,
        { wrapInArrayStep: ['42'] },
        'Run output should match expected value'
      );
    } finally {
      await worker.stop();
    }
  })
);

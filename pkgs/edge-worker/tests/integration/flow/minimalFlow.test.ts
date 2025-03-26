import { assert, assertEquals } from '@std/assert';
import { createFlowWorker } from '../../../src/flow/createFlowWorker.ts';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '../../../../dsl/src/dsl.ts';
import { waitFor } from '../../e2e/_helpers.ts';
import { delay } from '@std/async';
import type { Json } from '../../../src/core/types.ts';

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

    // Create and start the flow worker
    const worker = createFlowWorker(MinimalFlow, {
      sql,
      maxConcurrent: 1,
      batchSize: 10,
    });

    try {
      // Start the worker
      worker.startOnlyOnce({
        edgeFunctionName: 'test_flow',
        workerId: crypto.randomUUID(),
      });

      await sql`select pgflow.create_flow('test_minimal_flow');`;
      await sql`select pgflow.add_step('test_minimal_flow', 'toStringStep');`;
      await sql`select pgflow.add_step('test_minimal_flow', 'wrapInArrayStep', deps_slugs => ARRAY['toStringStep']::text[]);`;

      // Start a flow run with input value 42
      const [flowRun] = await sql<{ run_id: string }[]>`
        SELECT * FROM pgflow.start_flow('test_minimal_flow', ${42}::jsonb);
      `;
      console.log(`Started flow run`, flowRun);

      let i = 0;
      // Wait for the run to complete with a timeout
      const polledRun = await waitFor(
        async () => {
          // Check run status
          const [run] = await sql`
            SELECT * FROM pgflow.runs WHERE run_id = ${flowRun.run_id};
          `;

          i += 1;
          console.log(`Run ${i}`, run);

          if (run.status != 'completed' && run.status != 'failed') {
            return false;
          }

          return run;
        },
        {
          pollIntervalMs: 500,
          timeoutMs: 5000,
          description: `flow run ${flowRun.run_id} to be 'completed'`,
        }
      );

      console.log('Polled run', polledRun);

      assert(polledRun.status === 'completed', 'Run should be completed');

      // Verify step_states are all completed
      const stepStates = await sql<{ step_slug: string; status: string }[]>`
        SELECT step_slug, status FROM pgflow.step_states
        WHERE run_id = ${flowRun.run_id}
        ORDER BY step_slug;
      `;

      console.log('Step states:', stepStates);
      assertEquals(
        stepStates.map((s) => s.status),
        ['completed', 'completed'],
        'All step states should be completed'
      );

      // Verify step_tasks are all succeeded
      const stepTasks = await sql<
        { step_slug: string; status: string; output: Json }[]
      >`
        SELECT step_slug, status, output FROM pgflow.step_tasks
        WHERE run_id = ${flowRun.run_id}
        ORDER BY step_slug;
      `;

      console.log('Step tasks:', stepTasks);
      assertEquals(
        stepTasks.map((s) => s.status),
        ['completed', 'completed'],
        'All step tasks should be succeeded'
      );

      // Verify run is succeeded
      const [finalRun] = await sql<{ status: string; output: unknown }[]>`
        SELECT status, output FROM pgflow.runs WHERE run_id = ${flowRun.run_id};
      `;

      console.log('Final run:', finalRun);
      assertEquals(finalRun.status, 'completed', 'Run should be succeeded');

      // Verify run output matches expected ["42"]
      assertEquals(
        finalRun.output,
        { wrapInArrayStep: ['42'] },
        'Run output should match expected value'
      );
    } finally {
      // Stop the worker
      await worker.stop();
    }
  })
);

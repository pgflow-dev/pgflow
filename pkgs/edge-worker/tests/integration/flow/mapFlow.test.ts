import { assert, assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { delay } from '@std/async';
import { startFlow, startWorker } from '../_helpers.ts';
import {
  waitForRunCompletion,
  createRootMapFlow,
  createMixedFlow,
  getStepStates,
  getStepTasks,
  getRunOutput,
  assertAllStepsCompleted,
} from './_testHelpers.ts';

// Test 1: Root map - flow input is array, map processes each element
const RootMapFlow = new Flow<number[]>({ slug: 'test_root_map_flow' })
  .map({ slug: 'double' }, async (num) => {
    await delay(1);
    return num * 2;
  });

// Test 2: Dependent map - regular step returns array, map processes it
const DependentMapFlow = new Flow<{ prefix: string }>({ slug: 'test_dependent_map_flow' })
  .step({ slug: 'generateArray' }, async () => {
    await delay(1);
    return ['a', 'b', 'c'];
  })
  .map({ slug: 'uppercase', array: 'generateArray' }, async (str) => {
    await delay(1);
    return str.toUpperCase();
  })
  .step({ slug: 'aggregate', dependsOn: ['uppercase'] }, async (deps, ctx) => {
    await delay(1);
    const flowInput = await ctx.flowInput;
    return {
      prefix: flowInput.prefix,
      processed: deps.uppercase,
      count: deps.uppercase.length
    };
  });

// Test 3: Empty array map - tests taskless cascade completion
const EmptyArrayMapFlow = new Flow<number[]>({ slug: 'test_empty_array_map_flow' })
  .map({ slug: 'process' }, async (num) => {
    await delay(1);
    return num * 10;
  })
  .step({ slug: 'summarize', dependsOn: ['process'] }, async (input) => {
    await delay(1);
    return {
      isEmpty: input.process.length === 0,
      results: input.process
    };
  });

Deno.test(
  'root map executes successfully',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const worker = startWorker(sql, RootMapFlow, {
      maxConcurrent: 3,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 200,
    });

    try {
      // Setup: Create flow with root map step
      await createRootMapFlow(sql, 'test_root_map_flow', 'double');

      // Execute: Start flow with array input
      const flowRun = await startFlow(sql, RootMapFlow, [1, 2, 3]);
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      // Verify: Run completed successfully
      assert(polledRun.status === 'completed', 'Run should be completed');

      // Verify: Step states
      const stepStates = await getStepStates(sql, flowRun.run_id);
      assertEquals(stepStates.length, 1, 'Should have 1 step state');
      assertAllStepsCompleted(stepStates);

      // Verify: Tasks were created and completed with correct outputs
      const stepTasks = await getStepTasks(sql, flowRun.run_id);
      assertEquals(stepTasks.length, 3, 'Should have 3 tasks for 3 array elements');

      // Verify each task output (inputs [1,2,3] doubled to [2,4,6])
      assertEquals(stepTasks[0].output, 2, 'First task (input 1) should output 2');
      assertEquals(stepTasks[1].output, 4, 'Second task (input 2) should output 4');
      assertEquals(stepTasks[2].output, 6, 'Third task (input 3) should output 6');

      // Verify: Final aggregated output
      const finalRun = await getRunOutput(sql, flowRun.run_id);
      assertEquals(finalRun.status, 'completed', 'Run should be completed');
      assertEquals(finalRun.output, { double: [2, 4, 6] }, 'Run output should have aggregated results');

    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'dependent map executes successfully',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const worker = startWorker(sql, DependentMapFlow, {
      maxConcurrent: 3,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 200,
    });

    try {
      // Setup: Create flow with dependent steps (single -> map -> single)
      await createMixedFlow(sql, 'test_dependent_map_flow', [
        { slug: 'generateArray', deps: [], type: 'single' },
        { slug: 'uppercase', deps: ['generateArray'], type: 'map' },
        { slug: 'aggregate', deps: ['uppercase'], type: 'single' }
      ]);

      // Execute: Start flow and wait for completion
      const flowRun = await startFlow(sql, DependentMapFlow, { prefix: 'test' });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      // Verify: Run completed successfully
      assert(polledRun.status === 'completed', 'Run should be completed');

      // Verify: All steps completed
      const stepStates = await getStepStates(sql, flowRun.run_id);
      assertEquals(stepStates.length, 3, 'Should have 3 step states');
      assertAllStepsCompleted(stepStates);

      // Verify: Map step created correct tasks
      const mapTasks = await getStepTasks(sql, flowRun.run_id, 'uppercase');
      assertEquals(mapTasks.length, 3, 'Should have 3 map tasks');

      // Verify map outputs (inputs ["a","b","c"] uppercased to ["A","B","C"])
      assertEquals(mapTasks[0].output, 'A', 'First task (input "a") should output "A"');
      assertEquals(mapTasks[1].output, 'B', 'Second task (input "b") should output "B"');
      assertEquals(mapTasks[2].output, 'C', 'Third task (input "c") should output "C"');

      // Verify: Final aggregated output
      const finalRun = await getRunOutput(sql, flowRun.run_id);
      assertEquals(finalRun.status, 'completed', 'Run should be completed');
      assertEquals(
        finalRun.output,
        {
          aggregate: {
            prefix: 'test',
            processed: ['A', 'B', 'C'],
            count: 3
          }
        },
        'Run output should have final aggregated results'
      );

    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'empty array map completes without tasks',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const worker = startWorker(sql, EmptyArrayMapFlow, {
      maxConcurrent: 3,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 200,
    });

    try {
      // Setup: Create flow with map step followed by dependent step
      await createMixedFlow(sql, 'test_empty_array_map_flow', [
        { slug: 'process', deps: [], type: 'map' },
        { slug: 'summarize', deps: ['process'], type: 'single' }
      ]);

      // Execute: Start flow with empty array
      const flowRun = await startFlow(sql, EmptyArrayMapFlow, []);
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      // Verify: Run completed despite empty array
      assert(polledRun.status === 'completed', 'Run should be completed');

      // Verify: Both steps completed
      const stepStates = await getStepStates(sql, flowRun.run_id);
      assertEquals(stepStates.length, 2, 'Should have 2 step states');
      assertAllStepsCompleted(stepStates);

      // Verify: No tasks created for empty array map
      const mapTasks = await getStepTasks(sql, flowRun.run_id, 'process');
      assertEquals(mapTasks.length, 0, 'Should have NO tasks for empty array map');

      // Verify: Summarize step handled empty array correctly
      const finalRun = await getRunOutput(sql, flowRun.run_id);
      assertEquals(finalRun.status, 'completed', 'Run should be completed');
      assertEquals(
        finalRun.output,
        { summarize: { isEmpty: true, results: [] } },
        'Run output should show empty results'
      );

    } finally {
      await worker.stop();
    }
  })
);
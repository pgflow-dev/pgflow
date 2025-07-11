import { assert, assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { waitFor } from '../../e2e/_helpers.ts';
import { delay } from '@std/async';
import { startFlow, startWorker } from '../_helpers.ts';

// Test flow with root step delay
const RootStepDelayFlow = new Flow<{ message: string }>({ 
  slug: 'test_root_step_delay_flow',
  maxAttempts: 2,
  timeout: 5
})
  .step({ 
    slug: 'delayedRoot',
    startDelay: 2  // 2 second delay
  }, (input) => {
    console.log('Executing delayedRoot step');
    return `Delayed: ${input.run.message}`;
  });

// Test flow with normal step delay
const NormalStepDelayFlow = new Flow<{ value: number }>({ 
  slug: 'test_normal_step_delay_flow'
})
  .step({ 
    slug: 'immediate' 
  }, (input) => {
    console.log('Executing immediate step');
    return input.run.value * 2;
  })
  .step({ 
    slug: 'delayed',
    dependsOn: ['immediate'],
    startDelay: 3  // 3 second delay after immediate completes
  }, (input) => {
    console.log('Executing delayed step');
    return (input.immediate as number) + 10;
  });

// Test flow with cascaded delays
const CascadedDelayFlow = new Flow<{ start: string }>({ 
  slug: 'test_cascaded_delay_flow'
})
  .step({ 
    slug: 'first',
    startDelay: 1  // 1 second delay
  }, (input) => {
    console.log('Executing first step');
    return `${input.run.start}->first`;
  })
  .step({ 
    slug: 'second',
    dependsOn: ['first'],
    startDelay: 2  // 2 second delay after first completes
  }, (input) => {
    console.log('Executing second step');
    return `${input.first}->second`;
  })
  .step({ 
    slug: 'third',
    dependsOn: ['second'],
    startDelay: 1  // 1 second delay after second completes
  }, (input) => {
    console.log('Executing third step');
    return `${input.second}->third`;
  });

Deno.test(
  'root step with startDelay executes after delay',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const worker = startWorker(sql, RootStepDelayFlow, {
      maxConcurrent: 1,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    });

    try {
      // Create flow
      await sql`select pgflow.create_flow('test_root_step_delay_flow', 2, 5, 5);`;
      // Use the full signature with empty deps array for clarity
      await sql`select pgflow.add_step('test_root_step_delay_flow', 'delayedRoot', ARRAY[]::text[], null, null, null, 2);`;

      // Start flow and record start time
      const startTime = Date.now();
      const flowRun = await startFlow(sql, RootStepDelayFlow, { message: 'Hello' });

      // Verify initial state - step should be started but task should be queued
      const [initialStepState] = await sql`
        SELECT status FROM pgflow.step_states 
        WHERE run_id = ${flowRun.run_id} AND step_slug = 'delayedRoot';
      `;
      assertEquals(initialStepState.status, 'started', 'Step state should be started immediately');

      const [initialTask] = await sql`
        SELECT status FROM pgflow.step_tasks 
        WHERE run_id = ${flowRun.run_id} AND step_slug = 'delayedRoot';
      `;
      assertEquals(initialTask.status, 'queued', 'Task should be queued with delay');

      // Wait for completion
      const polledRun = await waitFor(
        async () => {
          const [run] = await sql`
            SELECT * FROM pgflow.runs WHERE run_id = ${flowRun.run_id};
          `;
          return run.status === 'completed' ? run : false;
        },
        {
          pollIntervalMs: 200,
          timeoutMs: 10000,
          description: `root step delay flow to complete`,
        }
      );

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      console.log(`Flow completed in ${duration}s`);
      assert(duration >= 2, 'Flow should take at least 2 seconds due to startDelay');
      
      // Verify output
      assertEquals(
        polledRun.output,
        { delayedRoot: 'Delayed: Hello' },
        'Output should match expected value'
      );
    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'normal step with startDelay executes after delay',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const worker = startWorker(sql, NormalStepDelayFlow, {
      maxConcurrent: 2,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    });

    try {
      // Create flow
      await sql`select pgflow.create_flow('test_normal_step_delay_flow');`;
      await sql`select pgflow.add_step('test_normal_step_delay_flow', 'immediate');`;
      await sql`select pgflow.add_step('test_normal_step_delay_flow', 'delayed', ARRAY['immediate']::text[], null, null, null, 3);`;

      const startTime = Date.now();
      const flowRun = await startFlow(sql, NormalStepDelayFlow, { value: 5 });

      // Wait a bit for immediate step to complete
      await delay(1000);

      // Check that immediate step is completed but delayed step is still queued
      const stepStates = await sql`
        SELECT step_slug, status FROM pgflow.step_states 
        WHERE run_id = ${flowRun.run_id}
        ORDER BY step_slug;
      `;

      const immediateState = stepStates.find(s => s.step_slug === 'immediate');
      const delayedState = stepStates.find(s => s.step_slug === 'delayed');

      assertEquals(immediateState?.status, 'completed', 'Immediate step should be completed');
      assertEquals(delayedState?.status, 'started', 'Delayed step should be started (waiting)');

      // Check task status
      const [delayedTask] = await sql`
        SELECT status FROM pgflow.step_tasks 
        WHERE run_id = ${flowRun.run_id} AND step_slug = 'delayed';
      `;
      assertEquals(delayedTask.status, 'queued', 'Delayed task should still be queued');

      // Wait for completion
      const polledRun = await waitFor(
        async () => {
          const [run] = await sql`
            SELECT * FROM pgflow.runs WHERE run_id = ${flowRun.run_id};
          `;
          return run.status === 'completed' ? run : false;
        },
        {
          pollIntervalMs: 200,
          timeoutMs: 10000,
          description: `normal step delay flow to complete`,
        }
      );

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      console.log(`Flow completed in ${duration}s`);
      assert(duration >= 3, 'Flow should take at least 3 seconds due to delayed step');
      
      // Verify output - only the last step's output is returned
      assertEquals(
        polledRun.output,
        { 
          delayed: 20     // 10 + 10
        },
        'Output should match expected values'
      );
    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'cascaded delays accumulate correctly',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const worker = startWorker(sql, CascadedDelayFlow, {
      maxConcurrent: 3,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    });

    try {
      // Create flow
      await sql`select pgflow.create_flow('test_cascaded_delay_flow');`;
      await sql`select pgflow.add_step('test_cascaded_delay_flow', 'first', ARRAY[]::text[], null, null, null, 1);`;
      await sql`select pgflow.add_step('test_cascaded_delay_flow', 'second', ARRAY['first']::text[], null, null, null, 2);`;
      await sql`select pgflow.add_step('test_cascaded_delay_flow', 'third', ARRAY['second']::text[], null, null, null, 1);`;

      const startTime = Date.now();
      const flowRun = await startFlow(sql, CascadedDelayFlow, { start: 'begin' });

      // Track when each step completes
      const stepCompletionTimes: Record<string, number> = {};

      await waitFor(
        async () => {
          const stepStates = await sql`
            SELECT step_slug, status, completed_at FROM pgflow.step_states 
            WHERE run_id = ${flowRun.run_id};
          `;

          // Record completion times
          for (const state of stepStates) {
            if (state.status === 'completed' && !stepCompletionTimes[state.step_slug]) {
              stepCompletionTimes[state.step_slug] = Date.now();
              console.log(`Step ${state.step_slug} completed at ${(Date.now() - startTime) / 1000}s`);
            }
          }

          const [run] = await sql`
            SELECT * FROM pgflow.runs WHERE run_id = ${flowRun.run_id};
          `;
          return run.status === 'completed' ? run : false;
        },
        {
          pollIntervalMs: 200,
          timeoutMs: 15000,
          description: `cascaded delay flow to complete`,
        }
      );

      const endTime = Date.now();
      const totalDuration = (endTime - startTime) / 1000;

      console.log(`Flow completed in ${totalDuration}s`);
      
      // Verify timing
      // - First step: 1s delay
      // - Second step: starts after first completes + 2s delay
      // - Third step: starts after second completes + 1s delay
      // Total minimum time: 1s + 2s + 1s = 4s (plus execution time)
      assert(totalDuration >= 4, 'Flow should take at least 4 seconds due to cascaded delays');

      // Verify delays between steps
      if (stepCompletionTimes.first && stepCompletionTimes.second) {
        const firstToSecond = (stepCompletionTimes.second - stepCompletionTimes.first) / 1000;
        assert(firstToSecond >= 2, 'Second step should start at least 2s after first completes');
      }

      if (stepCompletionTimes.second && stepCompletionTimes.third) {
        const secondToThird = (stepCompletionTimes.third - stepCompletionTimes.second) / 1000;
        assert(secondToThird >= 1, 'Third step should start at least 1s after second completes');
      }

      // Verify final output - only the last step's output is returned
      const [finalRun] = await sql`
        SELECT output FROM pgflow.runs WHERE run_id = ${flowRun.run_id};
      `;
      
      assertEquals(
        finalRun.output,
        { 
          third: 'begin->first->second->third'
        },
        'Output should show cascaded execution'
      );
    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'startDelay works with retries (delay only on first attempt)',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    let attemptCount = 0;
    const FlowWithRetry = new Flow<{ shouldFail: boolean }>({ 
      slug: 'test_retry_delay_flow',
      maxAttempts: 3,
      baseDelay: 1
    })
      .step({ 
        slug: 'retryStep',
        startDelay: 3
      }, (_input) => {
        attemptCount++;
        console.log(`Attempt ${attemptCount}`);
        if (attemptCount === 1) {
          throw new Error('First attempt fails');
        }
        return `Success on attempt ${attemptCount}`;
      });

    const worker = startWorker(sql, FlowWithRetry, {
      maxConcurrent: 1,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    });

    try {
      // Create flow
      await sql`select pgflow.create_flow('test_retry_delay_flow', 3, 1, 60);`;
      await sql`select pgflow.add_step('test_retry_delay_flow', 'retryStep', ARRAY[]::text[], null, null, null, 3);`;

      const startTime = Date.now();
      const flowRun = await startFlow(sql, FlowWithRetry, { shouldFail: true });

      // Wait for first attempt to fail (should take at least 3 seconds due to startDelay)
      await delay(4000);

      // Check that first attempt has failed
      const [firstAttemptTask] = await sql`
        SELECT status, attempts_count, error_message FROM pgflow.step_tasks 
        WHERE run_id = ${flowRun.run_id} AND step_slug = 'retryStep';
      `;
      
      assertEquals(firstAttemptTask.status, 'queued', 'Task should be queued for retry');
      assert(firstAttemptTask.attempts_count >= 1, 'Should have at least one attempt');
      assert(firstAttemptTask.error_message?.includes('First attempt fails'), 'Should have error message');

      // Wait for completion
      const polledRun = await waitFor(
        async () => {
          const [run] = await sql`
            SELECT * FROM pgflow.runs WHERE run_id = ${flowRun.run_id};
          `;
          return run.status === 'completed' ? run : false;
        },
        {
          pollIntervalMs: 200,
          timeoutMs: 10000,
          description: `retry flow to complete`,
        }
      );

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      console.log(`Flow completed in ${duration}s`);
      
      // Verify timing: initial delay (3s) + retry delay (1s baseDelay)
      assert(duration >= 4, 'Flow should take at least 4 seconds (3s initial + 1s retry)');
      assert(duration < 7, 'Flow should not re-apply startDelay on retry');

      // Verify output
      assertEquals(
        polledRun.output,
        { retryStep: 'Success on attempt 2' },
        'Should succeed on second attempt'
      );

      // Verify final task state
      const [finalTask] = await sql`
        SELECT status, attempts_count FROM pgflow.step_tasks 
        WHERE run_id = ${flowRun.run_id} AND step_slug = 'retryStep';
      `;
      
      assertEquals(finalTask.status, 'completed', 'Task should be completed');
      assertEquals(finalTask.attempts_count, 2, 'Should have exactly 2 attempts');
    } finally {
      await worker.stop();
    }
  })
);
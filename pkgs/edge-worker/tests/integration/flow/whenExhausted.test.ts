import { assert, assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { delay } from '@std/async';
import { startFlow, startWorker } from '../_helpers.ts';
import { waitForRunCompletion } from './_testHelpers.ts';
import {
  createFlowInDb,
  getStepStatesWithSkip,
  getStepTasksWithError,
} from './_conditionalHelpers.ts';

// Common worker config for all tests
const workerConfig = {
  maxConcurrent: 1,
  batchSize: 10,
  maxPollSeconds: 1,
  pollIntervalMs: 200,
} as const;

// =============================================================================
// Test 1: Handler fails with when_exhausted='fail' (default) - run fails
// =============================================================================
Deno.test(
  'retries exhausted with when_exhausted=fail causes run failure',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const FailOnErrorFlow = new Flow<{ value: number }>({
      slug: 'test_fail_on_error',
    })
      .step({ slug: 'first' }, async (input) => {
        await delay(1);
        return { doubled: input.value * 2 };
      })
      .step(
        {
          slug: 'failing_step',
          dependsOn: ['first'],
          maxAttempts: 1,
          // default whenExhausted: 'fail'
        },
        async () => {
          await delay(1);
          throw new Error('Handler intentionally failed');
        }
      )
      .step(
        { slug: 'after_fail', dependsOn: ['failing_step'] },
        async (deps) => {
          await delay(1);
          return { received: deps.failing_step };
        }
      );

    const worker = startWorker(sql, FailOnErrorFlow, workerConfig);

    try {
      await createFlowInDb(sql, FailOnErrorFlow);

      const flowRun = await startFlow(sql, FailOnErrorFlow, { value: 21 });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'failed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);

      const firstState = stepStates.find((s) => s.step_slug === 'first');
      assertEquals(firstState?.status, 'completed');

      const failingState = stepStates.find(
        (s) => s.step_slug === 'failing_step'
      );
      assertEquals(failingState?.status, 'failed');
      assertEquals(failingState?.skip_reason, null);

      const tasks = await getStepTasksWithError(sql, flowRun.run_id);
      const failingTask = tasks.find((t) => t.step_slug === 'failing_step');
      assertEquals(failingTask?.status, 'failed');
      assert(
        failingTask?.error_message?.includes('Handler intentionally failed'),
        'Error message should be preserved'
      );
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 2: Handler fails with when_exhausted='skip' - step skipped, run completes
// =============================================================================
Deno.test(
  'retries exhausted with when_exhausted=skip skips step with handler_failed',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const SkipOnErrorFlow = new Flow<{ value: number }>({
      slug: 'test_skip_on_error',
    })
      .step({ slug: 'first' }, async (input) => {
        await delay(1);
        return { doubled: input.value * 2 };
      })
      .step(
        {
          slug: 'optional_step',
          dependsOn: ['first'],
          maxAttempts: 1,
          whenExhausted: 'skip',
        },
        async () => {
          await delay(1);
          throw new Error('Optional step failed');
        }
      )
      .step(
        { slug: 'final', dependsOn: ['first', 'optional_step'] },
        async (deps) => {
          await delay(1);
          return {
            first: deps.first,
            optional: deps.optional_step ?? null,
          };
        }
      );

    const worker = startWorker(sql, SkipOnErrorFlow, workerConfig);

    try {
      await createFlowInDb(sql, SkipOnErrorFlow);

      const flowRun = await startFlow(sql, SkipOnErrorFlow, { value: 10 });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);

      const optionalState = stepStates.find(
        (s) => s.step_slug === 'optional_step'
      );
      assertEquals(optionalState?.status, 'skipped');
      assertEquals(optionalState?.skip_reason, 'handler_failed');
      assert(optionalState?.skipped_at !== null, 'skipped_at should be set');

      const finalState = stepStates.find((s) => s.step_slug === 'final');
      assertEquals(finalState?.status, 'completed');

      const tasks = await getStepTasksWithError(sql, flowRun.run_id);
      const optionalTask = tasks.find((t) => t.step_slug === 'optional_step');
      assert(
        optionalTask?.error_message?.includes('Optional step failed'),
        'Error message should be preserved even when step skipped'
      );
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 3: Handler fails with when_exhausted='skip-cascade' - cascades to dependents
// =============================================================================
Deno.test(
  'retries exhausted with when_exhausted=skip-cascade skips dependents',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const SkipCascadeOnErrorFlow = new Flow<{ value: number }>({
      slug: 'test_skip_cascade_error',
    })
      .step({ slug: 'first' }, async (input) => {
        await delay(1);
        return { value: input.value };
      })
      .step(
        {
          slug: 'risky_step',
          dependsOn: ['first'],
          maxAttempts: 1,
          whenExhausted: 'skip-cascade',
        },
        async () => {
          await delay(1);
          throw new Error('Risky operation failed');
        }
      )
      .step(
        { slug: 'depends_on_risky', dependsOn: ['risky_step'] },
        async (deps) => {
          await delay(1);
          return { used: deps.risky_step };
        }
      );

    const worker = startWorker(sql, SkipCascadeOnErrorFlow, workerConfig);

    try {
      await createFlowInDb(sql, SkipCascadeOnErrorFlow);

      const flowRun = await startFlow(sql, SkipCascadeOnErrorFlow, {
        value: 5,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);

      const riskyState = stepStates.find((s) => s.step_slug === 'risky_step');
      assertEquals(riskyState?.status, 'skipped');
      assertEquals(riskyState?.skip_reason, 'handler_failed');
      assert(riskyState?.skipped_at !== null);

      const dependentState = stepStates.find(
        (s) => s.step_slug === 'depends_on_risky'
      );
      assertEquals(dependentState?.status, 'skipped');
      assertEquals(dependentState?.skip_reason, 'dependency_skipped');
      assert(dependentState?.skipped_at !== null);

      const tasks = await getStepTasksWithError(sql, flowRun.run_id);
      const riskyTask = tasks.find((t) => t.step_slug === 'risky_step');
      assert(riskyTask?.error_message?.includes('Risky operation failed'));
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 4: Multiple retries before exhaustion with skip
// =============================================================================
Deno.test(
  'step retries multiple times before being skipped',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;
    let attemptCount = 0;

    const RetryThenSkipFlow = new Flow<{ maxAttempts: number }>({
      slug: 'test_retry_then_skip',
    })
      .step({ slug: 'init' }, async (input) => {
        await delay(1);
        return { attempts: input.maxAttempts };
      })
      .step(
        {
          slug: 'flaky_step',
          dependsOn: ['init'],
          maxAttempts: 3,
          baseDelay: 1,
          whenExhausted: 'skip',
        },
        async () => {
          attemptCount++;
          await delay(1);
          throw new Error(`Attempt ${attemptCount} failed`);
        }
      )
      .step(
        { slug: 'after_flaky', dependsOn: ['init', 'flaky_step'] },
        async () => {
          await delay(1);
          return { completed: true };
        }
      );

    const worker = startWorker(sql, RetryThenSkipFlow, workerConfig);

    try {
      await createFlowInDb(sql, RetryThenSkipFlow);

      const flowRun = await startFlow(sql, RetryThenSkipFlow, {
        maxAttempts: 3,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const tasks = await getStepTasksWithError(sql, flowRun.run_id);
      const flakyTask = tasks.find((t) => t.step_slug === 'flaky_step');
      assertEquals(flakyTask?.attempts_count, 3, 'Should have made 3 attempts');
      assert(flakyTask?.error_message?.includes('Attempt 3 failed'));

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);
      const flakyState = stepStates.find((s) => s.step_slug === 'flaky_step');
      assertEquals(flakyState?.status, 'skipped');
      assertEquals(flakyState?.skip_reason, 'handler_failed');
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 5: Handler succeeds - no skipping occurs (baseline)
// =============================================================================
Deno.test(
  'successful handler runs normally even with skip configured',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const SuccessfulHandlerFlow = new Flow<{ value: number }>({
      slug: 'test_successful_handler',
    })
      .step({ slug: 'first' }, async (input) => {
        await delay(1);
        return { value: input.value };
      })
      .step(
        {
          slug: 'maybe_skip',
          dependsOn: ['first'],
          whenExhausted: 'skip', // configured to skip on failure
        },
        async (deps) => {
          await delay(1);
          return { processed: deps.first.value * 2 };
        }
      )
      .step({ slug: 'final', dependsOn: ['maybe_skip'] }, async (deps) => {
        await delay(1);
        return { result: deps.maybe_skip ?? null };
      });

    const worker = startWorker(sql, SuccessfulHandlerFlow, workerConfig);

    try {
      await createFlowInDb(sql, SuccessfulHandlerFlow);

      const flowRun = await startFlow(sql, SuccessfulHandlerFlow, { value: 5 });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);
      for (const state of stepStates) {
        assertEquals(state.status, 'completed');
        assertEquals(state.skip_reason, null);
        assertEquals(state.skipped_at, null);
      }

      assertEquals(polledRun.output, {
        final: { result: { processed: 10 } },
      });
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 6: Combined conditions and failure handling
// =============================================================================
Deno.test(
  'combined condition and failure skipping work together',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const CombinedConditionsFlow = new Flow<{
      premium: boolean;
      risky: boolean;
    }>({
      slug: 'test_combined_conditions',
    })
      .step({ slug: 'base' }, async (input) => {
        await delay(1);
        return { premium: input.premium, risky: input.risky };
      })
      .step(
        {
          slug: 'conditional_risky',
          dependsOn: ['base'],
          maxAttempts: 1,
          if: { base: { risky: true } },
          whenExhausted: 'skip',
        },
        async () => {
          await delay(1);
          throw new Error('Risky conditional operation failed');
        }
      )
      .step(
        {
          slug: 'uses_conditional',
          dependsOn: ['base', 'conditional_risky'],
        },
        async (deps) => {
          await delay(1);
          return {
            base: deps.base,
            risky: deps.conditional_risky ?? null,
          };
        }
      );

    const worker = startWorker(sql, CombinedConditionsFlow, workerConfig);

    try {
      await createFlowInDb(sql, CombinedConditionsFlow);

      const flowRun = await startFlow(sql, CombinedConditionsFlow, {
        premium: false,
        risky: true,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);

      const conditionalState = stepStates.find(
        (s) => s.step_slug === 'conditional_risky'
      );
      assertEquals(conditionalState?.status, 'skipped');
      assertEquals(conditionalState?.skip_reason, 'handler_failed');
      assert(conditionalState?.skipped_at !== null);

      const usesState = stepStates.find(
        (s) => s.step_slug === 'uses_conditional'
      );
      assertEquals(usesState?.status, 'completed');

      const tasks = await getStepTasksWithError(sql, flowRun.run_id);
      const conditionalTask = tasks.find(
        (t) => t.step_slug === 'conditional_risky'
      );
      assert(
        conditionalTask?.error_message?.includes(
          'Risky conditional operation failed'
        )
      );
    } finally {
      await worker.stop();
    }
  })
);

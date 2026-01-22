import { assert, assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { delay } from '@std/async';
import { startFlow, startWorker } from '../_helpers.ts';
import { waitForRunCompletion } from './_testHelpers.ts';
import {
  createFlowInDb,
  getStepStatesWithSkip,
} from './_conditionalHelpers.ts';

// Common worker config for all tests
const workerConfig = {
  maxConcurrent: 1,
  batchSize: 10,
  maxPollSeconds: 1,
  pollIntervalMs: 200,
} as const;

// =============================================================================
// Test 1: Step with 'if' condition - condition met (step runs)
// =============================================================================
Deno.test(
  'conditional if - condition met runs step',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const stepWasCalled: Record<string, boolean> = {
      premium_feature: false,
    };

    const ConditionalIfMetFlow = new Flow<{ premium: boolean }>({
      slug: 'test_conditional_if_met',
    })
      .step({ slug: 'base' }, async (input) => {
        await delay(1);
        return { premium: input.premium };
      })
      .step(
        {
          slug: 'premium_feature',
          dependsOn: ['base'],
          if: { base: { premium: true } },
        },
        async (deps) => {
          stepWasCalled['premium_feature'] = true;
          await delay(1);
          return { accessed: true, from: deps.base };
        }
      );

    const worker = startWorker(sql, ConditionalIfMetFlow, workerConfig);

    try {
      await createFlowInDb(sql, ConditionalIfMetFlow);

      const flowRun = await startFlow(sql, ConditionalIfMetFlow, {
        premium: true,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);
      assertEquals(stepStates.length, 2);
      for (const state of stepStates) {
        assertEquals(state.status, 'completed');
        assertEquals(state.skip_reason, null);
        assertEquals(state.skipped_at, null);
      }

      // Only leaf steps (steps with no dependents) that completed are included in output
      // 'base' is not a leaf (has dependent 'premium_feature'), so only 'premium_feature' appears
      assertEquals(polledRun.output, {
        premium_feature: { accessed: true, from: { premium: true } },
      });

      assertEquals(
        stepWasCalled['premium_feature'],
        true,
        'premium_feature should have been called'
      );
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 2: Step with 'if' condition - condition NOT met (step skipped)
// =============================================================================
Deno.test(
  'conditional if - condition unmet skips step with condition_unmet',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const stepWasCalled: Record<string, boolean> = {
      premium_feature: false,
    };

    const ConditionalIfUnmetFlow = new Flow<{ premium: boolean }>({
      slug: 'test_conditional_if_unmet',
    })
      .step({ slug: 'base' }, async (input) => {
        await delay(1);
        return { premium: input.premium };
      })
      .step(
        {
          slug: 'premium_feature',
          dependsOn: ['base'],
          if: { base: { premium: true } },
        },
        async (deps) => {
          stepWasCalled['premium_feature'] = true;
          await delay(1);
          return { accessed: true, from: deps.base };
        }
      );

    const worker = startWorker(sql, ConditionalIfUnmetFlow, workerConfig);

    try {
      await createFlowInDb(sql, ConditionalIfUnmetFlow);

      const flowRun = await startFlow(sql, ConditionalIfUnmetFlow, {
        premium: false,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);
      assertEquals(stepStates.length, 2);

      const baseState = stepStates.find((s) => s.step_slug === 'base');
      assertEquals(baseState?.status, 'completed');
      assertEquals(baseState?.skip_reason, null);

      const premiumState = stepStates.find(
        (s) => s.step_slug === 'premium_feature'
      );
      assertEquals(premiumState?.status, 'skipped');
      assertEquals(premiumState?.skip_reason, 'condition_unmet');
      assert(premiumState?.skipped_at !== null, 'skipped_at should be set');

      // Only leaf steps that completed are included in output
      // 'base' is not a leaf, and 'premium_feature' (the only leaf) was skipped
      // so output is null (jsonb_object_agg returns null for empty set)
      assertEquals(polledRun.output, null);

      assertEquals(
        stepWasCalled['premium_feature'],
        false,
        'premium_feature should NOT have been called'
      );
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 3: Step with 'ifNot' condition - forbidden pattern absent (step runs)
// =============================================================================
Deno.test(
  'conditional ifNot - forbidden pattern absent runs step',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const stepWasCalled: Record<string, boolean> = {
      optional_feature: false,
    };

    const ConditionalIfNotMetFlow = new Flow<{ disabled: boolean }>({
      slug: 'test_conditional_ifnot_met',
    })
      .step({ slug: 'base' }, async (input) => {
        await delay(1);
        return { disabled: input.disabled };
      })
      .step(
        {
          slug: 'optional_feature',
          dependsOn: ['base'],
          ifNot: { base: { disabled: true } },
        },
        async (deps) => {
          stepWasCalled['optional_feature'] = true;
          await delay(1);
          return { ran: true, from: deps.base };
        }
      );

    const worker = startWorker(sql, ConditionalIfNotMetFlow, workerConfig);

    try {
      await createFlowInDb(sql, ConditionalIfNotMetFlow);

      const flowRun = await startFlow(sql, ConditionalIfNotMetFlow, {
        disabled: false,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);
      assertEquals(stepStates.length, 2);
      for (const state of stepStates) {
        assertEquals(state.status, 'completed');
        assertEquals(state.skip_reason, null);
      }

      // Only leaf steps (steps with no dependents) that completed are included in output
      // 'base' is not a leaf (has dependent 'optional_feature'), so only 'optional_feature' appears
      assertEquals(polledRun.output, {
        optional_feature: { ran: true, from: { disabled: false } },
      });

      assertEquals(
        stepWasCalled['optional_feature'],
        true,
        'optional_feature should have been called'
      );
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 4: Step with 'ifNot' condition - forbidden pattern present (step skipped)
// =============================================================================
Deno.test(
  'conditional ifNot - forbidden pattern present skips step',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const stepWasCalled: Record<string, boolean> = {
      optional_feature: false,
    };

    const ConditionalIfNotUnmetFlow = new Flow<{ disabled: boolean }>({
      slug: 'test_conditional_ifnot_unmet',
    })
      .step({ slug: 'base' }, async (input) => {
        await delay(1);
        return { disabled: input.disabled };
      })
      .step(
        {
          slug: 'optional_feature',
          dependsOn: ['base'],
          ifNot: { base: { disabled: true } },
        },
        async (deps) => {
          stepWasCalled['optional_feature'] = true;
          await delay(1);
          return { ran: true, from: deps.base };
        }
      );

    const worker = startWorker(sql, ConditionalIfNotUnmetFlow, workerConfig);

    try {
      await createFlowInDb(sql, ConditionalIfNotUnmetFlow);

      const flowRun = await startFlow(sql, ConditionalIfNotUnmetFlow, {
        disabled: true,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);
      const optionalState = stepStates.find(
        (s) => s.step_slug === 'optional_feature'
      );
      assertEquals(optionalState?.status, 'skipped');
      assertEquals(optionalState?.skip_reason, 'condition_unmet');
      assert(optionalState?.skipped_at !== null);

      assertEquals(
        stepWasCalled['optional_feature'],
        false,
        'optional_feature should NOT have been called'
      );
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 5: Skip cascades - dependent step also skipped when parent skipped
// =============================================================================
Deno.test(
  'conditional skip cascades to dependent steps',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const stepWasCalled: Record<string, boolean> = {
      premium_feature: false,
      depends_on_premium: false,
    };

    const SkipCascadeFlow = new Flow<{ premium: boolean }>({
      slug: 'test_skip_cascade',
    })
      .step({ slug: 'base' }, async (input) => {
        await delay(1);
        return { premium: input.premium };
      })
      .step(
        {
          slug: 'premium_feature',
          dependsOn: ['base'],
          if: { base: { premium: true } },
          whenUnmet: 'skip-cascade', // cascade skip to dependents
        },
        async (_deps) => {
          stepWasCalled['premium_feature'] = true;
          await delay(1);
          return { accessed: true };
        }
      )
      .step(
        { slug: 'depends_on_premium', dependsOn: ['premium_feature'] },
        async (deps) => {
          stepWasCalled['depends_on_premium'] = true;
          await delay(1);
          return { enriched: true, from: deps.premium_feature };
        }
      );

    const worker = startWorker(sql, SkipCascadeFlow, workerConfig);

    try {
      await createFlowInDb(sql, SkipCascadeFlow);

      const flowRun = await startFlow(sql, SkipCascadeFlow, {
        premium: false,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);

      const baseState = stepStates.find((s) => s.step_slug === 'base');
      assertEquals(baseState?.status, 'completed');

      const premiumState = stepStates.find(
        (s) => s.step_slug === 'premium_feature'
      );
      assertEquals(premiumState?.status, 'skipped');
      assertEquals(premiumState?.skip_reason, 'condition_unmet');

      const dependentState = stepStates.find(
        (s) => s.step_slug === 'depends_on_premium'
      );
      assertEquals(dependentState?.status, 'skipped');
      assertEquals(dependentState?.skip_reason, 'dependency_skipped');

      assert(
        dependentState?.skipped_at !== null,
        'skipped_at should be set for dependent step'
      );

      assertEquals(
        stepWasCalled['premium_feature'],
        false,
        'premium_feature should NOT have been called'
      );
      assertEquals(
        stepWasCalled['depends_on_premium'],
        false,
        'depends_on_premium should NOT have been called'
      );
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 6: Non-cascade skip - downstream step still runs when dependency optional
// =============================================================================
Deno.test(
  'non-cascade skip - downstream runs with optional dependency skipped',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const stepWasCalled: Record<string, boolean> = {
      optional_enrichment: false,
      final_step: false,
    };

    const NonCascadeSkipFlow = new Flow<{ premium: boolean }>({
      slug: 'test_non_cascade_skip',
    })
      .step({ slug: 'base' }, async (input) => {
        await delay(1);
        return {
          premium: input.premium,
          value: input.premium ? 'premium' : 'basic',
        };
      })
      .step(
        {
          slug: 'optional_enrichment',
          dependsOn: ['base'],
          if: { base: { premium: true } },
          whenUnmet: 'skip', // not cascade - downstream can still run
        },
        async (deps) => {
          stepWasCalled['optional_enrichment'] = true;
          await delay(1);
          return { enriched: deps.base };
        }
      )
      .step(
        {
          slug: 'final_step',
          dependsOn: ['base', 'optional_enrichment'],
        },
        async (deps) => {
          stepWasCalled['final_step'] = true;
          await delay(1);
          return {
            base: deps.base,
            enrichment: deps.optional_enrichment ?? null,
          };
        }
      );

    const worker = startWorker(sql, NonCascadeSkipFlow, workerConfig);

    try {
      await createFlowInDb(sql, NonCascadeSkipFlow);

      const flowRun = await startFlow(sql, NonCascadeSkipFlow, {
        premium: false,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);
      assertEquals(stepStates.length, 3);

      const baseState = stepStates.find((s) => s.step_slug === 'base');
      assertEquals(baseState?.status, 'completed');

      const enrichmentState = stepStates.find(
        (s) => s.step_slug === 'optional_enrichment'
      );
      assertEquals(enrichmentState?.status, 'skipped');
      assertEquals(enrichmentState?.skip_reason, 'condition_unmet');

      const finalState = stepStates.find((s) => s.step_slug === 'final_step');
      assertEquals(finalState?.status, 'completed');
      assertEquals(finalState?.skip_reason, null);

      // Only leaf steps (steps with no dependents) that completed are included in output
      // 'base' is not a leaf, 'optional_enrichment' was skipped, only 'final_step' is a completed leaf
      assertEquals(polledRun.output, {
        final_step: {
          base: { premium: false, value: 'basic' },
          enrichment: null,
        },
      });

      assertEquals(
        stepWasCalled['optional_enrichment'],
        false,
        'optional_enrichment should NOT have been called'
      );
      assertEquals(
        stepWasCalled['final_step'],
        true,
        'final_step should have been called'
      );
    } finally {
      await worker.stop();
    }
  })
);

// =============================================================================
// Test 7: Condition unmet with whenUnmet='fail' causes run failure
// =============================================================================
Deno.test(
  'condition unmet with when_unmet=fail causes run failure',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const stepWasCalled: Record<string, boolean> = {
      premium_only: false,
      after_premium: false,
    };

    const FailOnUnmetFlow = new Flow<{ premium: boolean }>({
      slug: 'test_fail_on_unmet',
    })
      .step({ slug: 'base' }, async (input) => {
        await delay(1);
        return { premium: input.premium };
      })
      .step(
        {
          slug: 'premium_only',
          dependsOn: ['base'],
          if: { base: { premium: true } },
          whenUnmet: 'fail',
        },
        async (deps) => {
          stepWasCalled['premium_only'] = true;
          await delay(1);
          return { accessed: true, from: deps.base };
        }
      )
      .step(
        { slug: 'after_premium', dependsOn: ['premium_only'] },
        async (deps) => {
          stepWasCalled['after_premium'] = true;
          await delay(1);
          return { received: deps.premium_only };
        }
      );

    const worker = startWorker(sql, FailOnUnmetFlow, workerConfig);

    try {
      await createFlowInDb(sql, FailOnUnmetFlow);

      const flowRun = await startFlow(sql, FailOnUnmetFlow, {
        premium: false,
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'failed');

      const stepStates = await getStepStatesWithSkip(sql, flowRun.run_id);
      assertEquals(stepStates.length, 3);

      const baseState = stepStates.find((s) => s.step_slug === 'base');
      assertEquals(baseState?.status, 'completed');
      assertEquals(baseState?.skip_reason, null);

      const premiumState = stepStates.find(
        (s) => s.step_slug === 'premium_only'
      );
      assertEquals(premiumState?.status, 'failed');
      assertEquals(premiumState?.skip_reason, null);

      assertEquals(
        stepWasCalled['premium_only'],
        false,
        'premium_only should NOT have been called'
      );
      assertEquals(
        stepWasCalled['after_premium'],
        false,
        'after_premium should NOT have been called'
      );
    } finally {
      await worker.stop();
    }
  })
);

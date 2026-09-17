import { assert, assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow, withStepQueues } from '@pgflow/dsl';
import { delay } from '@std/async';
import { startFlow, startWorker } from '../_helpers.ts';
import {
  getStepStates,
  waitForRunCompletion,
} from './_testHelpers.ts';

// Two-step flow with private per-step queues (#651): one typed DAG, one run,
// separate private queues per step.
const communityThreads = withStepQueues(
  new Flow<{ text: string }>({ slug: 'test_step_queues_flow' })
    .step({ slug: 'classify' }, (flowInput) => ({
      route: flowInput.text.includes('help') ? 'help' : 'ignore',
    }))
    .step(
      { slug: 'deliverSlack', dependsOn: ['classify'] },
      (deps) => ({ delivered: deps.classify.route })
    )
);

Deno.test(
  'two-step flow executes one DAG across separate step queues',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const classifyWorker = await startWorker(sql, communityThreads, {
      stepSlug: 'classify',
      maxConcurrent: 2,
      batchSize: 5,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    });
    const deliverWorker = await startWorker(sql, communityThreads, {
      stepSlug: 'deliverSlack',
      maxConcurrent: 1,
      batchSize: 5,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    });

    try {
      const flowRun = await startFlow(sql, communityThreads.wrapped, {
        text: 'need help please',
      });
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assertEquals(polledRun.status, 'completed', 'Run should complete');
      assertEquals(polledRun.output, {
        deliverSlack: { delivered: 'help' },
      });

      // Every step records its own generated route, ordered
      const routes = await sql<{ step_slug: string; queue_name: string }[]>`
        select step_slug, queue_name
        from pgflow.steps
        where flow_slug = 'test_step_queues_flow'
        order by step_index
      `;
      assertEquals([...routes], [
        { step_slug: 'classify', queue_name: 'test_step_queues_flow__classify' },
        { step_slug: 'deliverSlack', queue_name: 'test_step_queues_flow__deliverslack' },
      ]);

      // The flow's queue_mode is persisted as deployment metadata
      const [flowRow] = await sql<{ queue_mode: string }[]>`
        select queue_mode from pgflow.flows where flow_slug = 'test_step_queues_flow'
      `;
      assertEquals(flowRow.queue_mode, 'step');

      // No unused default queue was created
      const [defaultQueue] = await sql<{ count: string }[]>`
        select count(*)::text as count from pgmq.list_queues()
        where queue_name = 'test_step_queues_flow'
      `;
      assertEquals(defaultQueue.count, '0');

      // Each worker registered against exactly its own step queue
      const workerQueues = await sql<{ queue_name: string }[]>`
        select distinct queue_name
        from pgflow.workers
        where queue_name like 'test_step_queues_flow__%'
        order by queue_name
      `;
      assertEquals(
        [...workerQueues].map((w) => w.queue_name),
        ['test_step_queues_flow__classify', 'test_step_queues_flow__deliverslack']
      );

      // All step states completed
      const states = await getStepStates(sql, flowRun.run_id);
      assertEquals(states.length, 2);
      assert(states.every((s: { status: string }) => s.status === 'completed'));
    } finally {
      await classifyWorker.stop();
      await deliverWorker.stop();
    }
  })
);

// Isolation flow: two independent root steps so one blocked worker cannot
// starve the other's ready work. The slow step's handler blocks on a gate
// until the test releases it — no machine-speed timing dependency.
Deno.test(
  'a blocked step worker does not starve ready work on another step queue',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    let releaseSlow!: () => void;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const flow = withStepQueues(
      new Flow<number>({ slug: 'test_step_isolation_flow' })
        .step({ slug: 'slowStep' }, async () => {
          await slowGate;
          return 'slow';
        })
        .step({ slug: 'fastStep' }, () => 'fast')
    );

    const slowWorker = await startWorker(sql, flow, {
      stepSlug: 'slowStep',
      maxConcurrent: 1,
      batchSize: 1,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    });
    const fastWorker = await startWorker(sql, flow, {
      stepSlug: 'fastStep',
      maxConcurrent: 1,
      batchSize: 1,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    });

    try {
      const flowRun = await startFlow(sql, flow.wrapped, 1);

      // Poll until the fast step completes while the slow step is gated.
      let fastCompletedWhileGated = false;
      for (let i = 0; i < 100 && !fastCompletedWhileGated; i++) {
        await delay(100);
        const states = await sql<{ step_slug: string; status: string }[]>`
          select step_slug, status from pgflow.step_states
          where run_id = ${flowRun.run_id}
        `;
        const byStep = new Map(states.map((s) => [s.step_slug, s.status]));
        if (byStep.get('fastStep') === 'completed') {
          assert(
            byStep.get('slowStep') !== 'completed',
            'slow step must not complete while its handler is gated'
          );
          fastCompletedWhileGated = true;
        }
      }
      assert(
        fastCompletedWhileGated,
        'fast step must complete independently of the blocked slow worker'
      );

      // Release the gate and let the run finish
      releaseSlow();
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);
      assertEquals(polledRun.status, 'completed');
      assertEquals(polledRun.output, { fastStep: 'fast', slowStep: 'slow' });
    } finally {
      releaseSlow();
      await fastWorker.stop();
      await slowWorker.stop();
    }
  })
);

import { assert, assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { startFlow, startWorker } from '../_helpers.ts';
import {
  waitForRunCompletion,
  getStepTasks,
  assertAllTasksCompleted,
} from './_testHelpers.ts';

// Queue identity (#650): a plain flow runs end-to-end through its stored
// queue identity, foreign messages in the same queue stay untouched while
// valid work continues, and a legacy mixed-case physical queue keeps working.
const QueueIdentityFlow = new Flow<number>({ slug: 'test_queue_identity' })
  .step({ slug: 'doubleIt' }, (flowInput) => flowInput * 2);

const LegacyQueueFlow = new Flow<number>({ slug: 'TestLegacyQueue' })
  .step({ slug: 'doubleIt' }, (flowInput) => flowInput * 2);

Deno.test(
  'flow executes through the stored queue identity; unmatched messages are preserved',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    // Create the flow definition (worker startup will verify it)
    await sql`select pgflow.create_flow('test_queue_identity');`;
    await sql`select pgflow.add_step('test_queue_identity', 'doubleIt');`;

    // A foreign message with no matching task, sent directly into the queue
    await sql`
      select pgmq.send(queue_name => 'test_queue_identity', msg => '{"foreign": true}'::jsonb)
    `;

    const worker = startWorker(sql, QueueIdentityFlow, {
      maxConcurrent: 1,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 200,
    });

    try {
      const flowRun = await startFlow(sql, QueueIdentityFlow, 21);
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assert(polledRun.status === 'completed', 'Run should be completed');

      const stepTasks = await getStepTasks(sql, flowRun.run_id);
      assertEquals(stepTasks.length, 1, 'Should have 1 step task');
      assertAllTasksCompleted(stepTasks);

      // The foreign message was never claimed, archived, or deleted
      const [foreign] = await sql<{ count: string }[]>`
        select count(*)::text as count from pgmq.q_test_queue_identity
        where message->>'foreign' = 'true'
      `;
      assertEquals(foreign.count, '1', 'foreign message must remain in the queue');

      // Tasks store the canonical queue snapshot
      const [task] = await sql<{ queue_name: string }[]>`
        select queue_name from pgflow.step_tasks where run_id = ${flowRun.run_id}
      `;
      assertEquals(task.queue_name, 'test_queue_identity');
    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'flow worker runs a legacy mixed-case physical queue through the stored identity',
  withPgNoTransaction(async (sql) => {
    await sql`select pgflow_tests.reset_db();`;

    const flowSlug = 'TestLegacyQueue';

    // Simulate a flow upgraded from 0.16.0: definition and queue exist, the
    // queue keeps its original mixed-case spelling
    await sql`select pgflow.create_flow(${flowSlug});`;
    await sql`select pgflow.add_step(${flowSlug}, 'doubleIt');`;
    await sql`select pgmq.drop_queue('testlegacyqueue');`;
    await sql`select pgmq.create('TestLegacyQueue');`;

    const worker = startWorker(sql, LegacyQueueFlow, {
      maxConcurrent: 1,
      batchSize: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 200,
    });

    try {
      const flowRun = await startFlow(sql, LegacyQueueFlow, 5);
      const polledRun = await waitForRunCompletion(sql, flowRun.run_id);

      assert(polledRun.status === 'completed', 'Run should be completed');

      // The message was dispatched, claimed, and archived on the physical queue
      const [archiveCount] = await sql<{ count: string }[]>`
        select count(*)::text as count from pgmq.a_TestLegacyQueue
      `;
      assertEquals(archiveCount.count, '1', 'message archived on the physical queue');

      // No second metadata entry was created for the canonical name
      const [listed] = await sql<{ count: string }[]>`
        select count(*)::text as count from pgmq.list_queues()
        where lower(queue_name) = 'testlegacyqueue'
      `;
      assertEquals(listed.count, '1', 'exactly one queue for the flow');
    } finally {
      await worker.stop();
    }
  })
);

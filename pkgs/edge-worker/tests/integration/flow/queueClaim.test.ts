import { assertEquals } from '@std/assert';
import { withPgNoTransaction } from '../../db.ts';
import { Flow } from '@pgflow/dsl';
import { createFlowWorker } from '../../../src/flow/createFlowWorker.ts';
import { createTestPlatformAdapter } from '../_helpers.ts';
import { fakeLogger } from '../../fakes.ts';
import { Queue } from '../../../src/queue/Queue.ts';
import type { postgres } from '../../sql.ts';
import type { MessageHandlerContext } from '../../../src/core/context.ts';
import { delay } from '@std/async';

// #650 queue identity end-to-end claim: PGMQ identity sequence starts above
// Number.MAX_SAFE_INTEGER, so every ID that crosses the JavaScript boundary
// must survive as an exact decimal string — in contexts, in the client, and
// in queue/archive operations. A numeric round-trip anywhere in the path
// silently corrupts these IDs (9007199254740993 === 9007199254740992 in
// IEEE-754 doubles).
const MAX_SAFE = 9007199254740992;
const ID_FIRST = '9007199254740993';
const ID_SECOND = '9007199254740994';

const ClaimFlow = new Flow<number[]>({
  slug: 'queue_claim_flow',
})
  .map({ slug: 'work' }, async (input: number, ctx) => {
    // Both exposure paths must carry the exact decimal-string ID.
    const rawId = ctx.rawMessage.msg_id;
    const taskId = ctx.stepTask.msg_id;
    if (typeof rawId !== 'string' || typeof taskId !== 'string') {
      throw new Error(
        `msg_id lost string identity: raw=${typeof rawId} task=${typeof taskId}`
      );
    }
    if (rawId !== taskId) {
      throw new Error(`cross-ID operation: raw=${rawId} task=${taskId}`);
    }
    if (BigInt(rawId) <= BigInt(MAX_SAFE)) {
      throw new Error(`unexpected small msg_id ${rawId}`);
    }
    if (input === 2) {
      // Fails and requeues; the deadline loop below waits for exhaustion
      // and archival by queue snapshot.
      throw new Error('intentional failure for the second item');
    }
    return input * 10;
  });

Deno.test(
  'queue claim keeps bigint message IDs lossless end-to-end',
  withPgNoTransaction(async (sql: postgres.Sql) => {
    await sql`select pgflow_tests.reset_db()`;

    // Seed the flow definition through the new canonical path.
    const worker = createFlowWorker(
      ClaimFlow,
      { sql, maxConcurrent: 1, batchSize: 10, maxPollSeconds: 1, pollIntervalMs: 100 },
      () => fakeLogger,
      createTestPlatformAdapter(sql)
    );
    await worker.startOnlyOnce({
      edgeFunctionName: 'queue_claim_test',
      workerId: crypto.randomUUID(),
    });

    // Push the identity sequence above MAX_SAFE_INTEGER before producing.
    await sql`
      select setval(
        pg_get_serial_sequence('pgmq.q_queue_claim_flow', 'msg_id'),
        ${MAX_SAFE}::bigint, true
      )
    `;

    const [run] = await sql<{ run_id: string }[]>`
      select run_id from pgflow.start_flow(
        'queue_claim_flow', '[1, 2]'::jsonb
      )
    `;
    assertEquals(run.run_id.length, 36, 'run started');

    // Raw queue read shares the same string ID contract (#650).
    const rawQueue = new Queue(sql, 'queue_claim_flow', fakeLogger);
    const raw = await rawQueue.readWithPoll(10, 5, 5, 100);
    assertEquals(raw.length, 2, 'raw queue read sees both messages');
    for (const msg of raw) {
      assertEquals(typeof msg.msg_id, 'string', 'raw queue msg_id is a string');
      assertEquals(
        BigInt(msg.msg_id) > BigInt(MAX_SAFE),
        true,
        `raw queue msg_id above MAX_SAFE_INTEGER: ${msg.msg_id}`
      );
    }

    // Requeue both for the worker (the raw read moved visibility).
    await sql`
      select pgflow.set_vt_batch(
        'queue_claim_flow',
        array[${raw[0].msg_id}::bigint, ${raw[1].msg_id}::bigint],
        array[0, 0]
      )
    `;

    try {
      // Let the worker claim and execute both tasks.
      const deadline = Date.now() + 60_000;
      for (;;) {
        const [{ done }] = await sql<{ done: boolean }[]>`
          select not exists (
            select 1 from pgflow.step_tasks
            where flow_slug = 'queue_claim_flow' and status in ('queued', 'started')
          ) as done
        `;
        if (done || Date.now() > deadline) break;
        await delay(200);
      }
    } finally {
      await worker.stop();
    }

    const tasks = await sql<
      { task_index: number; status: string; message_id: string | null; output: unknown }[]
    >`
      select task_index, status, message_id::text as message_id, output
      from pgflow.step_tasks
      where flow_slug = 'queue_claim_flow'
      order by task_index
    `;
    assertEquals(tasks.length, 2, 'both tasks present');

    const [first, second] = [...tasks].sort((a, b) => (a.message_id! < b.message_id! ? -1 : 1));
    assertEquals(first.status, 'completed', 'lower-ID task completed');
    assertEquals(first.output, 10, 'lower-ID task output is its own');
    assertEquals(first.message_id, ID_FIRST, 'first task exact string ID');
    assertEquals(second.status, 'failed', 'higher-ID task exhausted');
    assertEquals(second.message_id, ID_SECOND, 'second task exact string ID');

    // The exhausted task's message was archived via its queue snapshot; the
    // completed task's message was archived by complete_task. No active
    // message remains, and both archive rows keep their exact IDs.
    const [{ active }] = await sql<{ active: number }[]>`
      select count(*)::int as active from pgmq.q_queue_claim_flow
    `;
    assertEquals(active, 0, 'no active messages remain');
    const archived = await sql<{ msg_id: string }[]>`
      select msg_id::text as msg_id from pgmq.a_queue_claim_flow order by msg_id
    `;
    assertEquals(
      archived.map((a) => a.msg_id),
      [ID_FIRST, ID_SECOND],
      'archive holds exactly both string IDs'
    );
  })
);

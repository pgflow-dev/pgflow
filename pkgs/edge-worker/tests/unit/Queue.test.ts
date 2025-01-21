import { assertEquals, assertExists, assertObjectMatch } from '@std/assert';
import { Queue } from '../../src/Queue.ts';
import { type postgres, withSql } from '../sql.ts';
import { MessageRecord } from '../../src/types.ts';

// Test message type
type TestPayload = {
  id: string;
  data: string;
};

async function readAllMessages(sql: postgres.Sql, queueName: string) {
  return await sql<MessageRecord<TestPayload>[]>`
    SELECT * FROM pgmq.read(
      queue_name => ${queueName},
      vt => 2,
      qty => 9999
    )
  `;
}

async function clearDb(sql: postgres.Sql, queueName: string) {
  await sql`SELECT * FROM pgmq.purge_queue(${queueName})`;
  await sql`DELETE FROM edge_worker.workers`;
}

Deno.test(
  'Queue#safeCreate creates queue and handles duplicate creation',
  async () => {
    await withSql(async (sql) => {
      const queue = new Queue<TestPayload>(sql, 'test_queue_safe_create');

      // First creation should succeed
      await queue.safeCreate();

      // Second creation should not throw
      await queue.safeCreate();

      // Verify queue exists using pgmq.metrics()
      const metrics = await sql`
        SELECT * FROM pgmq.metrics('test_queue_safe_create')
      `;

      assertEquals(metrics.length, 1);
      assertEquals(metrics[0].queue_name, 'test_queue_safe_create');
    });
  }
);

Deno.test('Queue operations integration test', async (t) => {
  await withSql(async (sql) => {
    await clearDb(sql, 'test_queue');
    const queue = new Queue<TestPayload>(sql, 'test_queue');
    await queue.safeCreate();
    const testMessage: TestPayload = {
      id: '123',
      data: 'test data',
    };

    await queue.send(testMessage);
    const messages = await readAllMessages(sql, 'test_queue');

    await t.step('read message', async () => {
      assertEquals(messages.length, 1);
      assertExists(messages[0].msg_id);
    });

    await t.step('set visibility timeout', async () => {
      const message = messages[0];
      const updatedMessage = await queue.setVt(message.msg_id, 10);
      assertExists(updatedMessage);
      assertEquals(updatedMessage.message, message.message);
    });

    // await t.step('archive single message', async () => {
    //   const msgId = await queue.send(testMessage);
    //   await queue.archive(testMessage.msg_id);
    //
    //   // Verify message is no longer available
    //   const newMessages = await readAllMessages(sql, 'test_queue');
    //   assertEquals(newMessages.length, 0);
    // });
  });
});

Deno.test('Queue batch operations', async (t) => {
  await withSql(async (sql) => {
    await clearDb(sql, 'test_queue_batch');
    const queue = new Queue<TestPayload>(sql, 'test_queue_batch');
    await queue.safeCreate();
    const testMessages: TestPayload[] = [
      { id: '1', data: 'test 1' },
      { id: '2', data: 'test 2' },
      { id: '3', data: 'test 3' },
    ];

    await t.step('send multiple messages', async () => {
      for (const msg of testMessages) {
        await queue.send(msg);
      }
    });

    await t.step('read multiple messages', async () => {
      const messages = await readAllMessages(sql, 'test_queue_batch');
      assertEquals(messages.length, 3);
    });

    // await t.step('archive batch', async () => {
    //   const messages = await readAllMessages(sql, 'test_queue');
    //   const msgIds = messages.map((m) => m.msg_id);
    //   await queue.archiveBatch(msgIds);
    //
    //   // Verify messages are no longer available
    //   const newMessages = await readAllMessages(sql, 'test_queue');
    //   assertEquals(newMessages.length, 0);
    // });
  });
});

// Deno.test('Queue readWithPoll with different parameters', async () => {
//   await withSql(async (sql) => {
//     const queue = new Queue<TestPayload>(sql, 'test_queue_params');
//     await queue.safeCreate();
//     const testMessage: TestPayload = {
//       id: '123',
//       data: 'test data',
//     };
//
//     // Send a message
//     await queue.send(testMessage);
//
//     // Test different read parameters
//     const messages = await queue.readWithPoll(
//       5, // batch size
//       30, // visibility timeout
//       2, // max poll seconds
//       500 // poll interval ms
//     );
//
//     assertEquals(messages.length, 1);
//     assertEquals(messages[0].message, testMessage);
//   });
// });

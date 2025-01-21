import { assertEquals, assertExists } from '@std/assert';
import { Queue } from '../../src/Queue.ts';
import { withSql } from '../sql.ts';

// Test message type
type TestMessage = {
  id: string;
  data: string;
};

Deno.test(
  'Queue#safeCreate creates queue and handles duplicate creation',
  async () => {
    await withSql(async (sql) => {
      const queue = new Queue<TestMessage>(sql, 'test_queue_safe_create');

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
    const queue = new Queue<TestMessage>(sql, 'test_queue');
    await queue.safeCreate();
    const testMessage: TestMessage = {
      id: '123',
      data: 'test data',
    };

    await t.step('send message', async () => {
      await queue.send(testMessage);
    });

    await t.step('read message', async () => {
      const messages = await queue.readWithPoll(1, 2, 1, 100);
      assertEquals(messages.length, 1);
      assertEquals(messages[0].message, testMessage);
      assertExists(messages[0].msg_id);
    });

    await t.step('set visibility timeout', async () => {
      const messages = await queue.readWithPoll(1);
      const message = messages[0];
      const updatedMessage = await queue.setVt(message.msg_id, 10);
      assertExists(updatedMessage);
      assertEquals(updatedMessage.message, message.message);
    });

    await t.step('archive single message', async () => {
      const messages = await queue.readWithPoll(1);
      const message = messages[0];
      await queue.archive(message.msg_id);

      // Verify message is no longer available
      const newMessages = await queue.readWithPoll(1, 2, 1, 100);
      assertEquals(newMessages.length, 0);
    });
  });
});

Deno.test('Queue batch operations', async (t) => {
  await withSql(async (sql) => {
    const queue = new Queue<TestMessage>(sql, 'test_queue_batch');
    await queue.safeCreate();
    const testMessages: TestMessage[] = [
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
      const messages = await queue.readWithPoll(3);
      assertEquals(messages.length, 3);
      messages.forEach((message, i) => {
        assertEquals(message.message, testMessages[i]);
      });
    });

    await t.step('archive batch', async () => {
      const messages = await queue.readWithPoll(3);
      const msgIds = messages.map((m) => m.msg_id);
      await queue.archiveBatch(msgIds);

      // Verify messages are no longer available
      const newMessages = await queue.readWithPoll(3, 2, 1, 100);
      assertEquals(newMessages.length, 0);
    });
  });
});

Deno.test('Queue readWithPoll with different parameters', async () => {
  await withSql(async (sql) => {
    const queue = new Queue<TestMessage>(sql, 'test_queue_params');
    await queue.safeCreate();
    const testMessage: TestMessage = {
      id: '123',
      data: 'test data',
    };

    // Send a message
    await queue.send(testMessage);

    // Test different read parameters
    const messages = await queue.readWithPoll(
      5, // batch size
      30, // visibility timeout
      2, // max poll seconds
      500 // poll interval ms
    );

    assertEquals(messages.length, 1);
    assertEquals(messages[0].message, testMessage);
  });
});

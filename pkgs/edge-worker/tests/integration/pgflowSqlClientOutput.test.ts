import { assertEquals } from '@std/assert';
import { PgflowSqlClient } from '@pgflow/core';
import type { Json } from '@pgflow/core';
import { withTransaction } from '../db.ts';

const cases: Array<{ name: string; output: Json | undefined; json: string }> = [
  { name: 'zero', output: 0, json: '0' },
  { name: 'false', output: false, json: 'false' },
  { name: 'empty string', output: '', json: '""' },
  { name: 'JSON null', output: null, json: 'null' },
  { name: 'undefined as JSON null', output: undefined, json: 'null' },
];

for (const { name, output, json } of cases) {
  Deno.test(
    `PgflowSqlClient.completeTask stores ${name} in PostgreSQL`,
    withTransaction(async (sql) => {
      const flowSlug = 'sql_client_output';
      await sql`select pgflow.create_flow(${flowSlug})`;
      await sql`select pgflow.add_step(${flowSlug}, 'work')`;
      const [worker] = await sql<{ worker_id: string }[]>`
        insert into pgflow.workers (worker_id, queue_name, function_name)
        values (gen_random_uuid(), ${flowSlug}, 'output_test')
        returning worker_id
      `;
      const client = new PgflowSqlClient(sql);
      const run = await client.startFlow(flowSlug, {});
      const messages = await client.readMessages(flowSlug, 10, 1, 1, 10);
      assertEquals(messages.length, 1);
      const tasks = await client.startTasks(
        flowSlug,
        messages.map((message) => message.msg_id),
        worker.worker_id,
        flowSlug
      );
      assertEquals(tasks.length, 1);

      await client.completeTask(tasks[0], output);

      const [stored] = await sql`
        select status, output::text as json, output is null as sql_null
        from pgflow.step_tasks
        where run_id = ${run.run_id}::uuid and step_slug = 'work' and task_index = 0
      `;
      assertEquals(stored, { status: 'completed', json, sql_null: false });
    })
  );
}

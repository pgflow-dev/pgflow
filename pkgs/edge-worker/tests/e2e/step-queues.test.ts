import { withSql } from '../sql.ts';
import { assertEquals } from 'jsr:@std/assert';
import { startWorker, waitFor } from './_helpers.ts';

const FLOW_SLUG = 'e2eStepQueues';
const FIRST_WORKER = 'step_queue_first';
const SECOND_WORKER = 'step_queue_second';

Deno.test(
  {
    name: 'step queues - deployed workers execute a two-step flow',
    sanitizeOps: false,
    sanitizeResources: false,
  },
  () => withSql(async (sql) => {
    const existing = await sql`
      select 1 from pgflow.flows where flow_slug = ${FLOW_SLUG}
    `;
    if (existing.length > 0) {
      await sql`select pgflow.delete_flow_and_data(${FLOW_SLUG})`;
    }

    await startWorker(FIRST_WORKER);
    await startWorker(SECOND_WORKER);

    const [started] = await sql<{ run_id: string }[]>`
      select run_id
      from pgflow.start_flow(${FLOW_SLUG}, ${sql.json({ value: 20 })}::jsonb)
    `;
    const completed = await waitFor(
      async () => {
        const [run] = await sql<{ status: string; output: unknown }[]>`
          select status, output from pgflow.runs where run_id = ${started.run_id}::uuid
        `;
        return run?.status === 'completed' ? run : false;
      },
      { timeoutMs: 20000, description: 'two-step queued flow completion' }
    );

    assertEquals(completed.output, { second: { value: 42 } });

    const routes = await sql<{ step_slug: string; queue_name: string }[]>`
      select step_slug, queue_name
      from pgflow.steps
      where flow_slug = ${FLOW_SLUG}
      order by step_index
    `;
    assertEquals([...routes], [
      { step_slug: 'first', queue_name: 'e2estepqueues__first' },
      { step_slug: 'second', queue_name: 'e2estepqueues__second' },
    ]);
  })
);

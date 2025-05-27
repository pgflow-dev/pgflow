import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types.js';

it(
  'minimal test - just log events',
  withPgNoTransaction(async (sql) => {
    // Grant minimal permissions for PgflowClient API access
    await grantMinimalPgflowPermissions(sql);

    // Create test flow and step
    const testFlow = createTestFlow();
    await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
    await sql`SELECT pgflow.add_step(${testFlow.slug}, 'simple_step')`;
    console.log('created flow', testFlow);

    // Spin up client and start the flow
    const supabaseClient = createTestSupabaseClient();
    const pgflowClient = new PgflowClient(supabaseClient);

    const input = { foo: 'bar' };
    const run = await pgflowClient.startFlow(testFlow.slug, input);
    console.log('started run', run);
    run.on('*', (x) => {
      console.log('ANY EVENT', x);
    });

    // Step: poll for available task, then complete it
    const tasks = await sql`
      SELECT * FROM pgflow.poll_for_tasks(${testFlow.slug}, 30, 1)
    `;
    await sql`
    SELECT pgflow.complete_task(
      ${tasks[0].run_id}::uuid,
      ${tasks[0].step_slug},
      0,
      '{"hello": "world"}'::jsonb
    )`;

    // Wait for the completion event (optional, but useful if you want all messages)
    console.log(
      'waiting stepComplete',
      await run
        .step('simple_step')
        .waitForStatus(FlowStepStatus.Completed, { timeoutMs: 1000 })
    );
    console.log(
      'waiting runComplete',
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 1000 })
    );

    await supabaseClient.removeAllChannels();
  }),
  5000
);

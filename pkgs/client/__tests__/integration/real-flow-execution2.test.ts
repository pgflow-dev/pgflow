import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types.js';
import { it } from 'vitest';
import { PgflowSqlClient } from '../../../core/src/PgflowSqlClient.js';

it(
  'minimal test - just log events',
  withPgNoTransaction(async (sql) => {
    // Grant minimal permissions for PgflowClient API access
    await grantMinimalPgflowPermissions(sql);

    // Create test flow and step
    const testFlow = createTestFlow('minimal_flow');
    await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
    await sql`SELECT pgflow.add_step(${testFlow.slug}, 'minimal_step')`;
    console.log('created flow', testFlow);

    // Create PgflowSqlClient for task operations
    const sqlClient = new PgflowSqlClient(sql);

    // Spin up client and start the flow
    const supabaseClient = createTestSupabaseClient();
    const pgflowClient = new PgflowClient(supabaseClient);

    const input = { foo: 'bar' };
    const run = await pgflowClient.startFlow(testFlow.slug, input);
    console.log('started run', run);
    run.on('*', (x) => {
      console.log('ANY EVENT', x);
    });

    // Give realtime subscription time to establish
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step: poll for available task, then complete it
    const tasks = await sqlClient.pollForTasks(testFlow.slug, 1, 5, 200, 2);
    await sqlClient.completeTask(tasks[0], { hello: 'world' });

    // Wait for the completion event (optional, but useful if you want all messages)
    console.log(
      'waiting stepComplete',
      await run
        .step('minimal_step')
        .waitForStatus(FlowStepStatus.Completed, { timeoutMs: 15000 })
    );
    console.log(
      'waiting runComplete',
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 15000 })
    );

    await supabaseClient.removeAllChannels();
  }),
  10000
);

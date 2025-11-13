import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../../helpers/db.js';
import { createTestSupabaseClient } from '../../helpers/setup.js';
import { createTestFlow } from '../../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../../helpers/permissions.js';
import { cleanupFlow } from '../../helpers/cleanup.js';
import { PgflowClient } from '../../../src/lib/PgflowClient.js';
import { PgflowSqlClient } from '@pgflow/core';
import { readAndStart } from '../../helpers/polling.js';
import { createEventTracker } from '../../helpers/test-utils.js';
import { FlowStepStatus, FlowRunStatus } from '../../../src/lib/types.js';

describe('Step Failed Event Broadcasting', () => {
  it(
    'should broadcast step:failed event when a step fails permanently',
    withPgNoTransaction(async (sql) => {
      // Setup test flow
      const testFlow = createTestFlow('step_failed_bug_test');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      // Create flow with max_attempts = 1 to fail immediately on first failure
      await sql`SELECT pgflow.create_flow(${testFlow.slug}, max_attempts => 1)`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'failing_step')`;

      // Create clients
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);
      const sqlClient = new PgflowSqlClient(sql);

      // Start the flow
      const run = await pgflowClient.startFlow(testFlow.slug, {});
      const step = run.step('failing_step');

      // Track events with event matchers
      const stepTracker = createEventTracker();
      const runTracker = createEventTracker();
      step.on('*', stepTracker.callback);
      run.on('*', runTracker.callback);

      // Poll and start the task (uses pgmq.read_with_poll and pgflow.start_tasks internally)
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      // Fail the task using the proper API (uses pgflow.fail_task)
      await sqlClient.failTask(
        tasks[0],
        'Step failed to demonstrate CTE optimization bug'
      );

      // Wait for step to reach failed status
      await step.waitForStatus(FlowStepStatus.Failed, { timeoutMs: 5000 });
      await run.waitForStatus(FlowRunStatus.Failed, { timeoutMs: 5000 });

      // Verify database state is correct
      expect(step.status).toBe(FlowStepStatus.Failed);
      expect(run.status).toBe(FlowRunStatus.Failed);
      expect(step.error_message).toBe('Step failed to demonstrate CTE optimization bug');

      // Verify step:failed event was broadcast using event matchers
      // Regression: This would fail if the CTE optimization bug existed
      expect(stepTracker).toHaveReceivedEvent('step:failed', {
        run_id: run.run_id,
        step_slug: 'failing_step',
        status: FlowStepStatus.Failed,
        error_message: 'Step failed to demonstrate CTE optimization bug',
      });

      // Verify run:failed event was broadcast
      expect(runTracker).toHaveReceivedEvent('run:failed', {
        run_id: run.run_id,
        status: FlowRunStatus.Failed,
      });

      await supabaseClient.removeAllChannels();
    }),
    15000
  );
});
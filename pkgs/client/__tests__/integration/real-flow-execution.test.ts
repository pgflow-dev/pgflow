import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowStepStatus } from '../../src/lib/types.js';
import { PgflowSqlClient } from '../../../core/src/PgflowSqlClient.js';

describe('Real Flow Execution E2E', () => {
  it(
    'polls task, completes it, and receives broadcast events',
    withPgNoTransaction(async (sql) => {
      // Grant minimal permissions for PgflowClient API access
      await grantMinimalPgflowPermissions(sql);

      // Create test flow and step
      const testFlow = createTestFlow('execution_flow');
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'execution_step')`;

      // Create PgflowSqlClient for task operations
      const sqlClient = new PgflowSqlClient(sql);

      // Create PgflowClient and start flow
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const input = { data: 'test-input' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);
      run.on('*', (e) => console.log('Event received:', e));

      expect(run.run_id).toBeDefined();
      expect(run.flow_slug).toBe(testFlow.slug);

      // Give realtime subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Poll for task and complete it
      const tasks = await sqlClient.pollForTasks(testFlow.slug, 1, 5, 200, 2);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].run_id).toBe(run.run_id);
      expect(tasks[0].step_slug).toBe('execution_step');
      expect(tasks[0].input.run).toEqual(input);

      const taskOutput = {
        result: 'completed successfully',
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 1500,
          details: { stage: 'final', retry_count: 0 },
        },
        data: { items: ['item1', 'item2'], count: 2 },
      };

      await sqlClient.completeTask(tasks[0], taskOutput);

      // Wait for step completion with increased timeout to test if it's just latency
      const step = run.step('execution_step');
      await step.waitForStatus(FlowStepStatus.Completed, {
        timeoutMs: 15000,
      });

      // Verify the PgflowClient state was updated correctly
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.output).toEqual(taskOutput);
      expect(typeof step.output).toBe('object');
      expect(step.output.metadata.duration).toBe(1500);
      expect(step.output.metadata.details.stage).toBe('final');
      expect(step.output.data.items).toEqual(['item1', 'item2']);
      expect(step.output.data.count).toBe(2);
      expect(step.completed_at).toBeDefined();

      await supabaseClient.removeAllChannels();
    }),
    10000
  );
});

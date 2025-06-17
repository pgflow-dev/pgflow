import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types.js';
import { PgflowSqlClient } from '@pgflow/core';
import { readAndStart } from '../helpers/polling.js';
import { cleanupFlow } from '../helpers/cleanup.js';

describe('Real Flow Execution', () => {
  it(
    'completes flow and verifies complex JSON output parsing',
    withPgNoTransaction(async (sql) => {
      // Grant minimal permissions for PgflowClient API access
      await grantMinimalPgflowPermissions(sql);

      // Create test flow and step
      const testFlow = createTestFlow('json_parsing_flow');
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'parsing_step')`;

      // Create PgflowSqlClient for task operations
      const sqlClient = new PgflowSqlClient(sql);

      // Create PgflowClient and start flow
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const input = { data: 'test-input' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      expect(run.run_id).toBeDefined();
      expect(run.flow_slug).toBe(testFlow.slug);

      // Give realtime subscription time to establish properly
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Poll for task
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      
      expect(tasks).toHaveLength(1);
      expect(tasks[0].input.run).toEqual(input);

      // Complete task with complex nested output to verify JSON parsing
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

      // Wait for step completion
      const step = run.step('parsing_step');
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });

      // Verify JSON was parsed correctly - nested properties should be accessible
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.output).toEqual(taskOutput);
      expect(typeof step.output).toBe('object');
      expect(step.output.metadata.duration).toBe(1500);
      expect(step.output.metadata.details.stage).toBe('final');
      expect(step.output.data.items).toEqual(['item1', 'item2']);
      expect(step.output.data.count).toBe(2);
      expect(step.completed_at).toBeDefined();

      // Wait for run completion
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 5000 });

      await supabaseClient.removeAllChannels();
    }),
    { timeout: 15000 }
  );

  it(
    'receives broadcast events during flow execution',
    withPgNoTransaction(async (sql) => {
      // Create test flow and step
      const testFlow = createTestFlow('event_flow');
      
      // Clean up flow data to ensure clean state
      await cleanupFlow(sql, testFlow.slug);
      
      // Grant minimal permissions for PgflowClient API access
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'event_step')`;

      // Create PgflowSqlClient for task operations
      const sqlClient = new PgflowSqlClient(sql);

      // Create PgflowClient and start flow
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const input = { foo: 'bar' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Track events without logging
      let runEventCount = 0;
      let stepEventCount = 0;
      
      run.on('*', () => { runEventCount++; });
      const step = run.step('event_step');
      step.on('*', () => { stepEventCount++; });

      // Give realtime subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Poll and complete task
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      await sqlClient.completeTask(tasks[0], { hello: 'world' });

      // Wait for completion
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 15000 });
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 15000 });

      // Verify events were received
      expect(runEventCount).toBeGreaterThan(0);
      expect(stepEventCount).toBeGreaterThan(0);

      await supabaseClient.removeAllChannels();
    }),
    10000
  );
});

import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowStepStatus } from '../../src/lib/types.js';
import { grantTestPermissions } from '../helpers/permissions.js';

describe('Real Flow Execution E2E', () => {
  it(
    'polls task, completes it, and receives broadcast events',
    withPgNoTransaction(async (sql) => {
      // Setup test flow definition
      const testFlow = createTestFlow();

      // Grant permissions for PostgREST access
      await grantTestPermissions(sql);

      // Test if realtime.send function exists
      const realtimeFunctionExists = await sql`
        SELECT EXISTS(
          SELECT 1 FROM pg_proc p 
          JOIN pg_namespace n ON p.pronamespace = n.oid 
          WHERE n.nspname = 'realtime' AND p.proname = 'send'
        ) as exists
      `;
      console.log('realtime.send function exists:', realtimeFunctionExists[0].exists);

      // Test if we can call realtime.send (should not error if available)
      try {
        await sql`
          SELECT realtime.send(
            '{"test": "message"}'::jsonb,
            'test-event',
            'test-topic',
            false
          )
        `;
        console.log('realtime.send call succeeded');
      } catch (error) {
        console.log('realtime.send call failed:', error.message);
      }

      // 3. Create flow and step definitions in database
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'simple_step')`;

      // 4. Create PgflowClient and start flow using the actual client API
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const input = { data: 'test-input' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      expect(run.run_id).toBeDefined();
      expect(run.flow_slug).toBe(testFlow.slug);
      
      // Give the PgflowClient's internal channel subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 5. Poll for task (simulate worker using raw SQL)
      const tasks = await sql`
      SELECT * FROM pgflow.poll_for_tasks(${testFlow.slug}, 30, 1)
    `;

      expect(tasks).toHaveLength(1);
      expect(tasks[0].run_id).toBe(run.run_id);
      expect(tasks[0].step_slug).toBe('simple_step');
      expect(tasks[0].input.run).toEqual(input);

      // 6. Get reference to the step
      const step = run.step('simple_step');

      // 7. Add debug logging to track events BEFORE completing the task
      let stepEventCount = 0;
      const unsubscribe = step.on('*', (event) => {
        stepEventCount++;
        console.log(`Received step event #${stepEventCount}:`, JSON.stringify(event, null, 2));
      });

      // Wait a moment to ensure subscription is fully established
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 8. Complete task with output (simulate worker using raw SQL)
      const taskOutput = {
        result: 'completed successfully',
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 1500,
          details: { stage: 'final', retry_count: 0 },
        },
        data: { items: ['item1', 'item2'], count: 2 },
      };
      await sql`
      SELECT pgflow.complete_task(
        ${tasks[0].run_id}::uuid,
        ${tasks[0].step_slug},
        0, -- task_index
        ${taskOutput}::jsonb
      )
    `;

      // 9. Wait for step completion with timeout (this tests the broadcast mechanism)
      try {
        await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
      } catch (error) {
        console.log(`Total step events received: ${stepEventCount}`);
        console.log(`Current step status: ${step.status}`);
        console.log(`Current step output: ${JSON.stringify(step.output)}`);
        
        // Check if broadcast was sent
        const sentBroadcast = await sql`
          SELECT * FROM realtime.messages 
          WHERE inserted_at > NOW() - INTERVAL '30 seconds'
          ORDER BY inserted_at DESC
          LIMIT 10
        `;
        console.log('Recent realtime messages:', JSON.stringify(sentBroadcast, null, 2));
        
        throw error;
      } finally {
        unsubscribe();
      }

      // 10. Verify the PgflowClient state was updated correctly
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.output).toEqual(taskOutput); // Should be parsed object, not JSON string
      expect(typeof step.output).toBe('object'); // Verify it's an object, not a string
      expect(step.output).not.toBe(JSON.stringify(taskOutput)); // Verify it's not the JSON string

      // Verify nested properties are accessible (proves JSON was parsed, not just a string)
      expect(step.output.metadata.duration).toBe(1500);
      expect(step.output.metadata.details.stage).toBe('final');
      expect(step.output.data.items).toEqual(['item1', 'item2']);
      expect(step.output.data.count).toBe(2);

      expect(step.completed_at).toBeDefined();

      // Clean up
      await supabaseClient.removeAllChannels();
    }),
    { timeout: 15000 }
  );
});

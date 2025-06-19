import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';

describe('Step Failed Event CTE Bug - Minimal Reproduction', () => {
  it(
    'demonstrates CTE optimization removing step:failed broadcast',
    withPgNoTransaction(async (sql) => {
      // Grant minimal permissions
      await grantMinimalPgflowPermissions(sql);

      // Create test flow with max_attempts = 1 to fail immediately
      await sql`SELECT pgflow.create_flow('cte_bug_test', max_attempts => 1)`;
      await sql`SELECT pgflow.add_step('cte_bug_test', 'test_step')`;

      // Create clients
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Start the flow
      const [{ run_id: runId }] = await sql`
        SELECT * FROM pgflow.start_flow('cte_bug_test', '{}'::jsonb)
      `;
      
      expect(runId).toBeTruthy();
      
      // Manually set up the step to be ready to fail
      await sql`SELECT pgflow.start_ready_steps(${runId})`;
      
      // Update the task to 'started' status (simulating worker picking it up)
      // This is required because fail_task only fails tasks that are in 'started' status
      await sql`
        UPDATE pgflow.step_tasks 
        SET status = 'started', 
            started_at = now(),
            attempts_count = 1
        WHERE run_id = ${runId} 
          AND step_slug = 'test_step'
          AND task_index = 0
      `;
      
      // Count realtime messages before fail_task
      const beforeMessages = await sql`
        SELECT event, payload->>'event_type' as event_type
        FROM realtime.messages 
        WHERE topic = ${'pgflow:run:' + runId}
        ORDER BY inserted_at
      `;
      
      console.log('Messages before fail_task:', beforeMessages.length);
      console.log('Event types before:', beforeMessages.map(m => m.event_type));
      
      // Now fail the task - this is where the bug occurs
      const failResult = await sql`
        SELECT * FROM pgflow.fail_task(
          ${runId},
          'test_step',
          0,
          'Testing CTE optimization bug'
        )
      `;
      console.log('fail_task returned status:', failResult[0]?.status);
      
      // Check run status after fail_task
      const runStatus = await sql`
        SELECT status FROM pgflow.runs WHERE run_id = ${runId}
      `;
      console.log('Run status after fail_task:', runStatus[0].status);
      
      // Check step state after fail_task
      const stepStateAfter = await sql`
        SELECT status FROM pgflow.step_states 
        WHERE run_id = ${runId} AND step_slug = 'test_step'
      `;
      console.log('Step state after fail_task:', stepStateAfter[0].status);
      
      // Get all messages after fail_task
      const afterMessages = await sql`
        SELECT event, payload->>'event_type' as event_type
        FROM realtime.messages 
        WHERE topic = ${'pgflow:run:' + runId}
        ORDER BY inserted_at
      `;
      
      console.log('Messages after fail_task:', afterMessages.length);
      console.log('All event types:', afterMessages.map(m => m.event_type));
      
      // Check for specific event types
      const eventTypes = afterMessages.map(m => m.event_type);
      const hasStepStarted = eventTypes.includes('step:started');
      const hasStepFailed = eventTypes.includes('step:failed');
      const hasRunFailed = eventTypes.includes('run:failed');
      
      console.log('Has step:started event:', hasStepStarted);
      console.log('Has step:failed event:', hasStepFailed);
      console.log('Has run:failed event:', hasRunFailed);
      
      // Verify the database state is correct
      expect(runStatus[0].status).toBe('failed');
      expect(stepStateAfter[0].status).toBe('failed');
      
      // Verify that step:started was broadcast
      expect(hasStepStarted).toBe(true);
      
      // Verify that run:failed was broadcast
      expect(hasRunFailed).toBe(true);
      
      // This is the bug - step:failed event is not sent due to CTE optimization
      if (!hasStepFailed) {
        console.error('\n*** BUG CONFIRMED ***');
        console.error('step:failed event was NOT broadcast!');
        console.error('The CTE with SELECT realtime.send() was optimized away by PostgreSQL');
        console.error('Database state is correct (step marked as failed) but event was not sent');
      }
      
      expect(hasStepFailed).toBe(true); // This will FAIL, demonstrating the bug!
      
      // Cleanup
      await sql`DELETE FROM pgflow.runs WHERE run_id = ${runId}`;
    })
  );
});
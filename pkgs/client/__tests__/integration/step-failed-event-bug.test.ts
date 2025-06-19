import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';

describe('Step Failed Event Broadcasting Bug', () => {
  it(
    'demonstrates that step:failed events are not broadcast due to CTE optimization',
    withPgNoTransaction(async (sql) => {
      // Grant minimal permissions
      await grantMinimalPgflowPermissions(sql);

      // Create test flow with max_attempts = 1 to fail immediately
      await sql`SELECT pgflow.create_flow('step_failed_bug_test', max_attempts => 1)`;
      await sql`SELECT pgflow.add_step('step_failed_bug_test', 'failing_step')`;

      // Create clients
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Start the flow
      const [{ run_id: runId }] = await sql`
        SELECT * FROM pgflow.start_flow('step_failed_bug_test', '{}'::jsonb)
      `;
      
      // Start the step
      await sql`SELECT pgflow.start_ready_steps(${runId})`;
      
      // Simulate worker processing: update task to 'started' status
      await sql`
        UPDATE pgflow.step_tasks 
        SET status = 'started', 
            started_at = now(),
            attempts_count = 1
        WHERE run_id = ${runId} 
          AND step_slug = 'failing_step'
          AND task_index = 0
      `;
      
      // Fail the task - this triggers the bug
      await sql`
        SELECT pgflow.fail_task(
          ${runId},
          'failing_step',
          0,
          'Step failed to demonstrate CTE optimization bug'
        )
      `;
      
      // Check database state
      const [runState] = await sql`
        SELECT status FROM pgflow.runs WHERE run_id = ${runId}
      `;
      const [stepState] = await sql`
        SELECT status FROM pgflow.step_states 
        WHERE run_id = ${runId} AND step_slug = 'failing_step'
      `;
      
      // Check broadcast events
      const messages = await sql`
        SELECT payload->>'event_type' as event_type
        FROM realtime.messages 
        WHERE topic = ${'pgflow:run:' + runId}
        ORDER BY inserted_at
      `;
      
      const eventTypes = messages.map(m => m.event_type);
      
      console.log('\n=== Step Failed Event Bug Test Results ===');
      console.log('Database State:');
      console.log('  Run status:', runState.status);
      console.log('  Step status:', stepState.status);
      console.log('\nBroadcast Events:');
      console.log('  Event types:', eventTypes);
      console.log('\nBug Analysis:');
      console.log('  run:failed event broadcast?', eventTypes.includes('run:failed') ? 'YES ✓' : 'NO ✗');
      console.log('  step:failed event broadcast?', eventTypes.includes('step:failed') ? 'YES ✓' : 'NO ✗');
      
      // Verify database state is correct
      expect(runState.status).toBe('failed');
      expect(stepState.status).toBe('failed');
      
      // Verify run:failed was broadcast (this works)
      expect(eventTypes).toContain('run:failed');
      
      // BUG: step:failed is NOT broadcast due to CTE optimization
      // The following assertion SHOULD pass but WILL fail
      expect(eventTypes).toContain('step:failed');
      
      // This test intentionally fails to demonstrate the bug
      // The fix would be to change the broadcast_step_failed CTE 
      // from using SELECT to using PERFORM like run:failed does
    })
  );
});
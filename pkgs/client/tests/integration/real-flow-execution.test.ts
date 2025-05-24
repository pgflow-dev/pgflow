import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowStepStatus } from '../../src/lib/types.js';

describe('Real Flow Execution E2E', () => {
  it('polls task, completes it, and receives broadcast events', withPgNoTransaction(async (sql) => {
    // Setup test flow definition
    const testFlow = createTestFlow();
    
    // 1. Configure authenticator role to expose pgflow schema to PostgREST
    await sql`ALTER ROLE authenticator SET pgrst.db_schemas TO 'public, pgflow, graphql_public'`;
    await sql`NOTIFY pgrst`;
    await sql`GRANT USAGE ON SCHEMA pgflow TO anon`;
    
    // Make start_flow_with_states security definer so it runs with postgres privileges
    await sql`
      CREATE OR REPLACE FUNCTION pgflow.start_flow_with_states(
        flow_slug TEXT,
        input JSONB,
        run_id UUID default null
      ) RETURNS JSONB
      SECURITY DEFINER
      AS $$
      DECLARE
        v_run_id UUID;
      BEGIN
        SELECT r.run_id INTO v_run_id FROM pgflow.start_flow(
          start_flow_with_states.flow_slug,
          start_flow_with_states.input,
          start_flow_with_states.run_id
        ) AS r LIMIT 1;
        RETURN pgflow.get_run_with_states(v_run_id);
      END;
      $$ language plpgsql;
    `;
    
    // 2. Create flow and step definitions in database
    await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
    await sql`SELECT pgflow.add_step(${testFlow.slug}, 'simple_step')`;
    
    // 3. Create PgflowClient and start flow using the actual client API
    const supabaseClient = createTestSupabaseClient();
    const pgflowClient = new PgflowClient(supabaseClient);
    
    const input = { data: 'test-input' };
    const run = await pgflowClient.startFlow(testFlow.slug, input);
    
    expect(run.run_id).toBeDefined();
    expect(run.flow_slug).toBe(testFlow.slug);
    
    // 4. Poll for task (simulate worker using raw SQL)
    const tasks = await sql`
      SELECT * FROM pgflow.poll_for_tasks(${testFlow.slug}, 30, 1)
    `;
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0].run_id).toBe(run.run_id);
    expect(tasks[0].step_slug).toBe('simple_step');
    expect(tasks[0].input.run).toEqual(input);
    
    // 5. Complete task with output (simulate worker using raw SQL)
    const taskOutput = { result: 'completed successfully', timestamp: new Date().toISOString() };
    
    await sql`
      SELECT pgflow.complete_task(
        ${tasks[0].run_id}::uuid,
        ${tasks[0].step_slug},
        0, -- task_index
        ${JSON.stringify(taskOutput)}::jsonb
      )
    `;
    
    // 6. Wait for broadcast event and verify PgflowClient received it
    const step = run.step('simple_step');
    
    // Wait for step completion with timeout (this tests the broadcast mechanism)
    await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
    
    // 7. Verify the PgflowClient state was updated correctly
    expect(step.status).toBe(FlowStepStatus.Completed);
    expect(JSON.parse(step.output as string)).toEqual(taskOutput);
    expect(step.completed_at).toBeDefined();
    
    // Clean up
    await supabaseClient.removeAllChannels();
  }));
});
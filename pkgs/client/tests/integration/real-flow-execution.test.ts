import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowStepStatus } from '../../src/lib/types.js';

describe('Real Flow Execution E2E', () => {
  it(
    'polls task, completes it, and receives broadcast events',
    withPgNoTransaction(async (sql) => {
      // Setup test flow definition
      const testFlow = createTestFlow();

      // 1. Redefine functions with SECURITY DEFINER for test
      await sql`
      CREATE OR REPLACE FUNCTION pgflow.start_flow_with_states(
        flow_slug TEXT,
        input JSONB,
        run_id UUID default null
      ) RETURNS JSONB AS $$
      DECLARE
        v_run_id UUID;
      BEGIN
        -- Start the flow using existing function
        SELECT r.run_id INTO v_run_id FROM pgflow.start_flow(
          start_flow_with_states.flow_slug,
          start_flow_with_states.input,
          start_flow_with_states.run_id
        ) AS r LIMIT 1;

        -- Use get_run_with_states to return the complete state
        RETURN pgflow.get_run_with_states(v_run_id);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

      await sql`
      CREATE OR REPLACE FUNCTION pgflow.get_run_with_states(
        run_id UUID
      ) RETURNS JSONB AS $$
        SELECT jsonb_build_object(
          'run', to_jsonb(r),
          'steps', COALESCE(jsonb_agg(to_jsonb(s)) FILTER (WHERE s.run_id IS NOT NULL), '[]'::jsonb)
        )
        FROM pgflow.runs r
        LEFT JOIN pgflow.step_states s ON s.run_id = r.run_id
        WHERE r.run_id = get_run_with_states.run_id
        GROUP BY r.run_id;
      $$ LANGUAGE sql SECURITY DEFINER;
    `;

      // Grant minimal permissions
      await sql`GRANT USAGE ON SCHEMA pgflow TO anon`;
      await sql`GRANT EXECUTE ON FUNCTION pgflow.start_flow_with_states(text, jsonb, uuid) TO anon`;
      await sql`GRANT EXECUTE ON FUNCTION pgflow.get_run_with_states(uuid) TO anon`;

      // Temporary fix: Grant schema access to service_role for PostgREST (before any client calls)
      await sql`GRANT USAGE ON SCHEMA pgflow TO anon, authenticated, service_role`;
      await sql`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgflow TO anon, authenticated, service_role`;
      await sql`GRANT SELECT ON TABLE pgflow.flows, pgflow.steps TO anon, authenticated, service_role`;

      // 2. Create realtime partition - fixes Supabase/realtime bug after db-reset
      // This is a workaround for a Supabase/realtime bug where partitions aren't immediately 
      // available after db-reset, causing realtime.send() to silently fail
      const partitionCreated = await sql`
        DO $$
        DECLARE
          target_date date := CURRENT_DATE;
          next_date date := target_date + interval '1 day';
          partition_name text := 'messages_' || to_char(target_date, 'YYYY_MM_DD');
          partition_exists boolean;
        BEGIN
          -- Check if partition already exists
          SELECT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = 'realtime'
            AND c.relname = partition_name
          ) INTO partition_exists;

          -- Create partition if it doesn't exist
          IF NOT partition_exists THEN
            EXECUTE format(
              'CREATE TABLE realtime.%I PARTITION OF realtime.messages
               FOR VALUES FROM (%L) TO (%L)',
              partition_name,
              target_date,
              next_date
            );
            
            -- Quick patch: Add partition to realtime publication for local dev
            EXECUTE format('ALTER TABLE realtime.%I REPLICA IDENTITY FULL', partition_name);
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE realtime.messages';
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE realtime.%I', partition_name);
            
            -- Grant same permissions as main realtime.messages table
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE realtime.%I TO anon, authenticated, service_role', partition_name);
            EXECUTE format('GRANT ALL ON TABLE realtime.%I TO supabase_realtime_admin, postgres, dashboard_user', partition_name);
            
            -- Enable RLS and create policies for realtime broadcast authorization
            EXECUTE format('ALTER TABLE realtime.%I ENABLE ROW LEVEL SECURITY', partition_name);
            EXECUTE format('CREATE POLICY "Allow service_role to receive broadcasts" ON realtime.%I FOR SELECT TO service_role USING (true)', partition_name);
            EXECUTE format('CREATE POLICY "Allow service_role to send broadcasts" ON realtime.%I FOR INSERT TO service_role WITH CHECK (true)', partition_name);
            
            RAISE NOTICE 'Created partition % for date range % to %',
              partition_name, target_date, next_date;
          ELSE
            RAISE NOTICE 'Partition % already exists', partition_name;
          END IF;
        END;
        $$
      `;
      console.log('Realtime partition creation attempted');

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

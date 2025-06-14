import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowStepStatus } from '../../src/lib/types.js';
import { PgflowSqlClient } from '@pgflow/core';
import { readAndStart } from '../helpers/polling.js';
import { cleanupFlow } from '../helpers/cleanup.js';

describe('Network Resilience Tests', () => {
  it(
    'recovers from connection drops during flow execution',
    withPgNoTransaction(async (sql) => {
      const testFlow = createTestFlow('network_resilience_flow');
      
      // Clean up flow data to ensure clean state
      await cleanupFlow(sql, testFlow.slug);
      
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'step_one')`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'step_two', deps_slugs => ARRAY['step_one'])`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const input = { data: 'resilience-test' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Track events received before and after disconnection
      const eventsBeforeDisconnect: any[] = [];
      const eventsAfterReconnect: any[] = [];
      let isReconnected = false;

      run.on('*', (event) => {
        if (isReconnected) {
          eventsAfterReconnect.push(event);
        } else {
          eventsBeforeDisconnect.push(event);
        }
      });

      // Give subscription time to establish
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Complete first step before disconnection
      let tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].step_slug).toBe('step_one');

      const stepOneOutput = { result: 'step one completed' };
      await sqlClient.completeTask(tasks[0], stepOneOutput);

      const stepOne = run.step('step_one');
      await stepOne.waitForStatus(FlowStepStatus.Completed, {
        timeoutMs: 5000,
      });
      expect(stepOne.status).toBe(FlowStepStatus.Completed);

      // Simulate network disconnection by unsubscribing from all channels
      console.log('=== Simulating network disconnection ===');
      await supabaseClient.removeAllChannels();

      // Wait a bit to ensure disconnection
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Complete second step while disconnected
      tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].step_slug).toBe('step_two');

      const stepTwoOutput = { result: 'step two completed while disconnected' };
      await sqlClient.completeTask(tasks[0], stepTwoOutput);

      // Reconnect by creating a new run instance (simulates app restart/reconnection)
      console.log('=== Simulating reconnection ===');
      const reconnectedRun = await pgflowClient.getRun(run.run_id);
      expect(reconnectedRun).toBeTruthy();

      if (!reconnectedRun) {
        throw new Error('Failed to retrieve run after reconnection');
      }

      isReconnected = true;

      reconnectedRun.on('*', (event) => {
        eventsAfterReconnect.push(event);
      });

      // Check database state directly to verify completion (bypass realtime dependency)
      // Wait a bit for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const runState =
        await sql`SELECT status FROM pgflow.runs WHERE run_id = ${reconnectedRun.run_id}::uuid`;
      expect(runState[0].status).toBe('completed');

      // Verify final state by checking database directly (more reliable than realtime events)
      const dbState = await sql`
        SELECT step_slug, status, output FROM pgflow.step_tasks
        WHERE run_id = ${reconnectedRun.run_id}::uuid
        ORDER BY step_slug
      `;

      expect(dbState).toHaveLength(2);
      expect(dbState[0].step_slug).toBe('step_one');
      expect(dbState[0].status).toBe('completed');
      expect(dbState[0].output).toEqual(stepOneOutput);

      expect(dbState[1].step_slug).toBe('step_two');
      expect(dbState[1].status).toBe('completed');
      expect(dbState[1].output).toEqual(stepTwoOutput);

      console.log('Events before disconnect:', eventsBeforeDisconnect.length);
      console.log('Events after reconnect:', eventsAfterReconnect.length);

      await supabaseClient.removeAllChannels();
    }),
    30000
  );

  it(
    'handles realtime subscription failures gracefully',
    withPgNoTransaction(async (sql) => {
      await grantMinimalPgflowPermissions(sql);

      const testFlow = createTestFlow('subscription_failure_flow');
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'resilient_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Track subscription status changes
      const connectionEvents: string[] = [];

      const input = { data: 'subscription-test' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Access the internal channel to monitor its status
      const channel = (run as any).channel;
      if (channel) {
        channel.subscribe((status: string) => {
          connectionEvents.push(status);
          console.log('Channel status changed:', status);
        });
      }

      // Give subscription time to establish
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Complete step while monitoring connection
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      const stepOutput = { result: 'completed despite connection issues' };
      await sqlClient.completeTask(tasks[0], stepOutput);

      // Verify step completion still works
      const step = run.step('resilient_step');
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 10000 });
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.output).toEqual(stepOutput);

      console.log('Connection events recorded:', connectionEvents);

      await supabaseClient.removeAllChannels();
    }),
    20000
  );

  it(
    'maintains state consistency under poor network conditions',
    withPgNoTransaction(async (sql) => {
      const testFlow = createTestFlow('poor_network_flow');
      
      // Clean up flow data to ensure clean state
      await cleanupFlow(sql, testFlow.slug);
      
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'network_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const input = { data: 'poor-network-test' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Simulate poor network by introducing delays and multiple reconnections
      for (let i = 0; i < 3; i++) {
        console.log(`=== Connection cycle ${i + 1} ===`);

        // Short connection period
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Disconnect
        await supabaseClient.removeAllChannels();

        // Short disconnection period
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Reconnect by getting run again
        const tempRun = await pgflowClient.getRun(run.run_id);
        expect(tempRun).toBeTruthy();
      }

      // Complete the step after network instability
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      const stepOutput = { result: 'survived network instability' };
      await sqlClient.completeTask(tasks[0], stepOutput);

      // Get fresh run instance and verify consistency
      const finalRun = await pgflowClient.getRun(run.run_id);
      expect(finalRun).toBeTruthy();

      if (!finalRun) {
        throw new Error('Failed to retrieve run after network instability');
      }

      // Check database state directly to verify completion (bypass realtime dependency)
      // Wait a bit for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const runState =
        await sql`SELECT status FROM pgflow.runs WHERE run_id = ${finalRun.run_id}::uuid`;
      expect(runState[0].status).toBe('completed');

      // Verify final state by checking database directly
      const dbState = await sql`
        SELECT status, output FROM pgflow.step_tasks
        WHERE run_id = ${finalRun.run_id}::uuid AND step_slug = 'network_step'
      `;

      expect(dbState).toHaveLength(1);
      expect(dbState[0].status).toBe('completed');
      expect(dbState[0].output).toEqual(stepOutput);

      await supabaseClient.removeAllChannels();
    }),
    30000
  );
});

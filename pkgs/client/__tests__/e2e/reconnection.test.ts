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

describe('Reconnection Integration Tests', () => {
  it(
    'handles client reconnection and state recovery',
    withPgNoTransaction(async (sql) => {
      await grantMinimalPgflowPermissions(sql);

      const testFlow = createTestFlow('reconnection_flow');
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'reconnection_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      // Start a real flow to have something to subscribe to
      const input = { url: 'https://example.com', data: 'reconnection-test' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      expect(run.flow_slug).toBe(testFlow.slug);
      expect(run.status).toBe(FlowRunStatus.Started);

      // Track reconnection events
      const reconnectionEvents: string[] = [];

      // Listen for events to track behavior
      run.on('*', (event) => {
        reconnectionEvents.push(event.event_type);
      });

      const step = run.step('reconnection_step');
      step.on('*', (event) => {
        reconnectionEvents.push(event.event_type);
      });

      // Simulate network interruption by creating a new client
      // This forces the underlying channel to be recreated
      const newSupabaseClient = createTestSupabaseClient();
      const newPgflowClient = new PgflowClient(newSupabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      // Subscribe with the new client to the same run
      const newRun = await newPgflowClient.getRun(run.run_id);
      expect(newRun).toBeDefined();
      expect(newRun).not.toBeNull();

      expect(newRun!.run_id).toBe(run.run_id);

      // Verify both clients can access the same flow state
      expect(run.flow_slug).toBe(newRun.flow_slug);
      expect(run.status).toBe(newRun.status);

      // Complete the step to generate events
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].step_slug).toBe('reconnection_step');

      const stepOutput = { result: 'completed despite connection changes' };
      await sqlClient.completeTask(tasks[0], stepOutput);

      // Wait for step completion
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.output).toEqual(stepOutput);

      // Wait for run completion
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 5000 });
      expect(run.status).toBe(FlowRunStatus.Completed);

      // Verify events were received (should have at least completion events)
      expect(reconnectionEvents.length).toBeGreaterThan(0);

      // Clean up
      await supabaseClient.removeAllChannels();
      await newSupabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'recovers state correctly after reconnection',
    withPgNoTransaction(async (sql) => {
      await grantMinimalPgflowPermissions(sql);

      const testFlow = createTestFlow('state_recovery_flow');
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'recovery_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      // Start a flow
      const input = { data: 'state-recovery-test' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Get initial state
      expect(run.status).toBe(FlowRunStatus.Started);
      expect(run.input).toEqual(input);

      // Simulate disconnection by disposing the client and creating a new one
      pgflowClient.dispose(run.run_id);
      
      // Wait a bit to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create new client instance (simulates reconnection)
      const newSupabaseClient = createTestSupabaseClient();
      const newPgflowClient = new PgflowClient(newSupabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });
      
      // Retrieve the same run
      const reconnectedRun = await newPgflowClient.getRun(run.run_id);
      expect(reconnectedRun).toBeDefined();
      expect(reconnectedRun).not.toBeNull();

      // State should be consistent
      expect(reconnectedRun!.run_id).toBe(run.run_id);
      expect(reconnectedRun.flow_slug).toBe(testFlow.slug);
      expect(reconnectedRun.input).toEqual(input);

      // Complete the step to verify functionality
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      const stepOutput = { result: 'recovered and completed' };
      await sqlClient.completeTask(tasks[0], stepOutput);

      const reconnectedStep = reconnectedRun!.step('recovery_step');
      await reconnectedStep.waitForStatus(FlowStepStatus.Completed, {
        timeoutMs: 5000,
      });
      expect(reconnectedStep.status).toBe(FlowStepStatus.Completed);
      expect(reconnectedStep.output).toEqual(stepOutput);

      // Clean up
      await supabaseClient.removeAllChannels();
      await newSupabaseClient.removeAllChannels();
    }),
    10000
  );

  it(
    'handles multiple rapid subscriptions correctly',
    withPgNoTransaction(async (sql) => {
      const testFlow = createTestFlow('rapid_subscription_flow');
      
      // Clean up flow data to ensure clean state
      await cleanupFlow(sql, testFlow.slug);
      
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'rapid_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      // Start a flow
      const input = { data: 'rapid-test' };
      const originalRun = await pgflowClient.startFlow(testFlow.slug, input);

      // Create multiple run instances rapidly (simulates rapid reconnections)
      const runs = await Promise.all([
        pgflowClient.getRun(originalRun.run_id),
        pgflowClient.getRun(originalRun.run_id),
        pgflowClient.getRun(originalRun.run_id),
      ]);

      // All should be the same instance (cached)
      expect(runs[0]).toBe(originalRun);
      expect(runs[1]).toBe(originalRun);
      expect(runs[2]).toBe(originalRun);

      // All should have consistent state
      for (const run of runs) {
        expect(run!.run_id).toBe(originalRun.run_id);
        expect(run!.flow_slug).toBe(testFlow.slug);
      }

      // Complete the step to verify all instances work
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      const stepOutput = { result: 'survived rapid subscriptions' };
      await sqlClient.completeTask(tasks[0], stepOutput);

      const step = originalRun.step('rapid_step');
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
      expect(step.status).toBe(FlowStepStatus.Completed);

      // Clean up
      await supabaseClient.removeAllChannels();
    }),
    10000
  );
});
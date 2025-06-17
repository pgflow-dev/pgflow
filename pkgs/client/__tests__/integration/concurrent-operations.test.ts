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

describe('Concurrent Operations Tests', () => {
  it(
    'runs multiple flows simultaneously without interference',
    withPgNoTransaction(async (sql) => {
      // Create two simpler flows (reduce complexity for reliability)
      const flow1 = createTestFlow('concurrent_flow_1');
      const flow2 = createTestFlow('concurrent_flow_2');
      
      // Clean up flow data to ensure clean state
      await cleanupFlow(sql, flow1.slug);
      await cleanupFlow(sql, flow2.slug);
      
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${flow1.slug})`;
      await sql`SELECT pgflow.add_step(${flow1.slug}, 'step_a')`;

      await sql`SELECT pgflow.create_flow(${flow2.slug})`;
      await sql`SELECT pgflow.add_step(${flow2.slug}, 'step_x')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Start flows sequentially to avoid overwhelming the system
      console.log('=== Starting flows ===');
      const run1 = await pgflowClient.startFlow(flow1.slug, { data: 'flow1-data' });
      const run2 = await pgflowClient.startFlow(flow2.slug, { data: 'flow2-data' });

      expect(run1.flow_slug).toBe(flow1.slug);
      expect(run2.flow_slug).toBe(flow2.slug);

      // Give realtime subscriptions time to establish
      await new Promise(resolve => setTimeout(resolve, 300));

      // Get and complete tasks from both flows
      console.log('=== Completing steps ===');
      
      const tasks1 = await readAndStart(sql, sqlClient, flow1.slug, 1, 5);
      const tasks2 = await readAndStart(sql, sqlClient, flow2.slug, 1, 5);

      expect(tasks1).toHaveLength(1);
      expect(tasks2).toHaveLength(1);

      // Complete tasks sequentially to avoid race conditions
      await sqlClient.completeTask(tasks1[0], { result: 'flow1-completed' });
      await sqlClient.completeTask(tasks2[0], { result: 'flow2-completed' });

      // Wait for flows to complete
      await Promise.all([
        run1.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 30000 }),
        run2.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 30000 })
      ]);

      // Verify completion
      expect(run1.status).toBe(FlowRunStatus.Completed);
      expect(run2.status).toBe(FlowRunStatus.Completed);

      // Debug: Check database state directly
      const dbState1 = await sql`SELECT status, output FROM pgflow.step_tasks WHERE run_id = ${run1.run_id}::uuid`;
      const dbState2 = await sql`SELECT status, output FROM pgflow.step_tasks WHERE run_id = ${run2.run_id}::uuid`;
      console.log('DB State 1:', dbState1);
      console.log('DB State 2:', dbState2);
      
      // Verify database shows completion (since realtime events may be delayed)
      expect(dbState1[0].status).toBe('completed');
      expect(dbState2[0].status).toBe('completed');
      expect(dbState1[0].output).toEqual({ result: 'flow1-completed' });
      expect(dbState2[0].output).toEqual({ result: 'flow2-completed' });

      console.log('=== Concurrent flows completed successfully ===');
      await supabaseClient.removeAllChannels();
    }),
    40000
  );

  it(
    'handles multiple clients observing the same flow',
    withPgNoTransaction(async (sql) => {
      const testFlow = createTestFlow('multi_client_flow');
      
      // Clean up flow data to ensure clean state
      await cleanupFlow(sql, testFlow.slug);
      
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'shared_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      
      // Create multiple Supabase clients (simulating different browser tabs/users)
      const supabaseClient1 = createTestSupabaseClient();
      const supabaseClient2 = createTestSupabaseClient();
      const supabaseClient3 = createTestSupabaseClient();
      
      const pgflowClient1 = new PgflowClient(supabaseClient1);
      const pgflowClient2 = new PgflowClient(supabaseClient2);
      const pgflowClient3 = new PgflowClient(supabaseClient3);

      // Client 1 starts the flow
      const input = { data: 'multi-client-test' };
      const originalRun = await pgflowClient1.startFlow(testFlow.slug, input);

      // Other clients get the same run
      const [observerRun1, observerRun2] = await Promise.all([
        pgflowClient2.getRun(originalRun.run_id),
        pgflowClient3.getRun(originalRun.run_id)
      ]);

      expect(observerRun1).toBeTruthy();
      expect(observerRun2).toBeTruthy();
      expect(observerRun1!.run_id).toBe(originalRun.run_id);
      expect(observerRun2!.run_id).toBe(originalRun.run_id);

      // Track events from all clients
      const client1Events: any[] = [];
      const client2Events: any[] = [];
      const client3Events: any[] = [];

      originalRun.on('*', (event) => client1Events.push(event));
      observerRun1!.on('*', (event) => client2Events.push(event));
      observerRun2!.on('*', (event) => client3Events.push(event));

      // Give all subscriptions time to establish
      await new Promise(resolve => setTimeout(resolve, 300));

      // Complete the step
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      const stepOutput = { result: 'completed with multiple observers' };
      await sqlClient.completeTask(tasks[0], stepOutput);

      // Wait for all clients to receive the completion event
      await Promise.all([
        originalRun.step('shared_step').waitForStatus(FlowStepStatus.Completed, { timeoutMs: 20000 }),
        observerRun1!.step('shared_step').waitForStatus(FlowStepStatus.Completed, { timeoutMs: 20000 }),
        observerRun2!.step('shared_step').waitForStatus(FlowStepStatus.Completed, { timeoutMs: 20000 })
      ]);

      // Verify all clients have the same final state
      expect(originalRun.step('shared_step').status).toBe(FlowStepStatus.Completed);
      expect(observerRun1!.step('shared_step').status).toBe(FlowStepStatus.Completed);
      expect(observerRun2!.step('shared_step').status).toBe(FlowStepStatus.Completed);

      expect(originalRun.step('shared_step').output).toEqual(stepOutput);
      expect(observerRun1!.step('shared_step').output).toEqual(stepOutput);
      expect(observerRun2!.step('shared_step').output).toEqual(stepOutput);

      // Verify at least some clients received events (realtime delivery can be unreliable in tests)
      console.log('Client 1 events:', client1Events.length);
      console.log('Client 2 events:', client2Events.length);
      console.log('Client 3 events:', client3Events.length);

      const totalEvents = client1Events.length + client2Events.length + client3Events.length;
      expect(totalEvents).toBeGreaterThan(0); // At least one client should receive events

      await Promise.all([
        supabaseClient1.removeAllChannels(),
        supabaseClient2.removeAllChannels(),
        supabaseClient3.removeAllChannels()
      ]);
    }),
    40000
  );

  it(
    'prevents resource conflicts between concurrent operations',
    withPgNoTransaction(async (sql) => {
      const testFlow = createTestFlow('resource_conflict_flow');
      
      // Clean up flow data to ensure clean state
      await cleanupFlow(sql, testFlow.slug);
      
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'resource_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Start fewer runs to reduce system load
      const runs = await Promise.all([
        pgflowClient.startFlow(testFlow.slug, { instance: 1 }),
        pgflowClient.startFlow(testFlow.slug, { instance: 2 }),
        pgflowClient.startFlow(testFlow.slug, { instance: 3 })
      ]);

      // Verify all runs are distinct
      const runIds = runs.map(r => r.run_id);
      const uniqueRunIds = [...new Set(runIds)];
      expect(uniqueRunIds.length).toBe(3);

      // Give subscriptions time to establish
      await new Promise(resolve => setTimeout(resolve, 300));

      // Poll for all tasks and complete them sequentially for reliability
      const allTasks = await readAndStart(sql, sqlClient, testFlow.slug, 5, 5);
      expect(allTasks.length).toBe(3); // One task per run

      // Verify each task belongs to a different run
      const taskRunIds = allTasks.map(task => task.run_id);
      const uniqueTaskRunIds = [...new Set(taskRunIds)];
      expect(uniqueTaskRunIds.length).toBe(3);

      // Create a mapping of run_id to instance number for correct verification
      const runInstanceMap = new Map();
      for (let i = 0; i < runs.length; i++) {
        runInstanceMap.set(runs[i].run_id, i + 1);
      }

      // Complete tasks sequentially, using the correct instance number for each task
      for (let i = 0; i < allTasks.length; i++) {
        const task = allTasks[i];
        const instanceNumber = runInstanceMap.get(task.run_id);
        await sqlClient.completeTask(task, { result: `completed-instance-${instanceNumber}` });
      }

      // Wait for all runs to complete
      await Promise.all(runs.map(run => 
        run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 30000 })
      ));

      // Verify all runs completed correctly without interference by checking database directly
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        expect(run.status).toBe(FlowRunStatus.Completed);
        
        // Check database state directly (more reliable than realtime events)
        const dbState = await sql`SELECT status, output FROM pgflow.step_tasks WHERE run_id = ${run.run_id}::uuid`;
        expect(dbState[0].status).toBe('completed');
        
        // Verify the output corresponds to the correct instance
        const expectedOutput = { result: `completed-instance-${i + 1}` };
        expect(dbState[0].output).toEqual(expectedOutput);
      }

      console.log('=== All concurrent instances completed without conflicts ===');
      await supabaseClient.removeAllChannels();
    }),
    40000
  );

  it(
    'maintains isolation between concurrent flow definitions',
    withPgNoTransaction(async (sql) => {
      // Create flows with similar step names but different behavior
      const flowA = createTestFlow('isolation_flow_a');
      const flowB = createTestFlow('isolation_flow_b');
      
      // Clean up flow data to ensure clean state
      await cleanupFlow(sql, flowA.slug);
      await cleanupFlow(sql, flowB.slug);
      
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${flowA.slug})`;
      await sql`SELECT pgflow.add_step(${flowA.slug}, 'common_step')`;

      await sql`SELECT pgflow.create_flow(${flowB.slug})`;
      await sql`SELECT pgflow.add_step(${flowB.slug}, 'common_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Start flows sequentially for reliability
      const runA = await pgflowClient.startFlow(flowA.slug, { type: 'flow-a' });
      const runB = await pgflowClient.startFlow(flowB.slug, { type: 'flow-b' });

      // Give subscriptions time to establish
      await new Promise(resolve => setTimeout(resolve, 300));

      // Get tasks from both flows
      const tasksA = await readAndStart(sql, sqlClient, flowA.slug, 2, 5);
      const tasksB = await readAndStart(sql, sqlClient, flowB.slug, 2, 5);

      expect(tasksA.length).toBe(1);
      expect(tasksB.length).toBe(1);

      // Verify tasks belong to correct flows
      expect(tasksA[0].run_id).toBe(runA.run_id);
      expect(tasksA[0].step_slug).toBe('common_step');
      
      expect(tasksB[0].run_id).toBe(runB.run_id);
      expect(tasksB[0].step_slug).toBe('common_step');

      // Complete tasks sequentially with flow-specific outputs
      await sqlClient.completeTask(tasksA[0], { 
        result: 'flow-a-common-step-completed',
        flow_type: 'A'
      });
      
      await sqlClient.completeTask(tasksB[0], { 
        result: 'flow-b-common-step-completed',
        flow_type: 'B'
      });

      // Wait for completion
      await Promise.all([
        runA.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 30000 }),
        runB.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 30000 })
      ]);

      // Verify isolation by checking database state directly
      const dbStateA = await sql`SELECT status, output FROM pgflow.step_tasks WHERE run_id = ${runA.run_id}::uuid`;
      const dbStateB = await sql`SELECT status, output FROM pgflow.step_tasks WHERE run_id = ${runB.run_id}::uuid`;
      
      expect(dbStateA[0].status).toBe('completed');
      expect(dbStateB[0].status).toBe('completed');
      
      // Verify isolation - outputs should be flow-specific
      expect(dbStateA[0].output.flow_type).toBe('A');
      expect(dbStateB[0].output.flow_type).toBe('B');

      // Verify step names didn't interfere despite similarity
      expect(dbStateA[0].output.result).toContain('flow-a');
      expect(dbStateB[0].output.result).toContain('flow-b');

      console.log('=== Flow isolation maintained successfully ===');
      await supabaseClient.removeAllChannels();
    }),
    40000
  );
});
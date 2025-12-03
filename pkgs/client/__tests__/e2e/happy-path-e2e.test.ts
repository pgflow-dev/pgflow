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
import { log } from '../helpers/debug.js';

describe('Happy Path E2E Integration', () => {
  it(
    'completes 3-step dependent DAG with realtime events end-to-end',
    withPgNoTransaction(async (sql) => {
      // Create 3-step dependent flow: fetch -> process -> save
      const testFlow = createTestFlow('happy_path_dag');
      
      // Clean up flow data to ensure clean state
      await cleanupFlow(sql, testFlow.slug);
      
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'fetch')`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'process', deps_slugs => ARRAY['fetch'])`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'save', deps_slugs => ARRAY['process'])`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      // Track all events received
      const receivedRunEvents: any[] = [];
      const receivedStepEvents: any[] = [];

      const input = { url: 'https://api.example.com/data' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Listen to all events for verification
      run.on('*', (event) => {
        log('Run event received:', event);
        receivedRunEvents.push(event);
      });

      const fetchStep = run.step('fetch');
      const processStep = run.step('process');
      const saveStep = run.step('save');

      fetchStep.on('*', (event) => {
        log('Fetch step event:', event);
        receivedStepEvents.push({ step: 'fetch', event });
      });

      processStep.on('*', (event) => {
        log('Process step event:', event);
        receivedStepEvents.push({ step: 'process', event });
      });

      saveStep.on('*', (event) => {
        log('Save step event:', event);
        receivedStepEvents.push({ step: 'save', event });
      });

      // Verify initial state
      expect(run.status).toBe(FlowRunStatus.Started);
      expect(run.input).toEqual(input);

      // Step 1: Complete fetch step
      log('=== Step 1: Completing fetch step ===');
      let tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].step_slug).toBe('fetch');
      expect(tasks[0].input.run).toEqual(input);

      const fetchOutput = { data: 'fetched content', status: 200, items: 10 };
      await sqlClient.completeTask(tasks[0], fetchOutput);

      // Wait for fetch completion
      await fetchStep.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
      expect(fetchStep.status).toBe(FlowStepStatus.Completed);
      expect(fetchStep.output).toEqual(fetchOutput);

      // Step 2: Complete process step (should now be available)
      log('=== Step 2: Completing process step ===');
      tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].step_slug).toBe('process');
      expect(tasks[0].input.run).toEqual(input);
      expect(tasks[0].input.fetch).toEqual(fetchOutput);

      const processOutput = { 
        processed_data: 'cleaned and validated', 
        item_count: fetchOutput.items * 2,
        metadata: { stage: 'processed', timestamp: new Date().toISOString() }
      };
      await sqlClient.completeTask(tasks[0], processOutput);

      // Wait for process completion
      await processStep.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
      expect(processStep.status).toBe(FlowStepStatus.Completed);
      expect(processStep.output).toEqual(processOutput);

      // Step 3: Complete save step (should now be available)
      log('=== Step 3: Completing save step ===');
      
      // Debug: Check dependencies in database
      const deps = await sql`
        SELECT * FROM pgflow.deps WHERE flow_slug = ${testFlow.slug}
        ORDER BY dep_slug, step_slug
      `;
      log('Dependencies in database:', deps);
      
      // Debug: Check step_tasks status
      const stepTasks = await sql`
        SELECT step_slug, status, output FROM pgflow.step_tasks 
        WHERE run_id = ${run.run_id}::uuid
        ORDER BY step_slug
      `;
      log('Step tasks status:', stepTasks);
      
      tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].step_slug).toBe('save');
      
      log('Save task input:', JSON.stringify(tasks[0].input, null, 2));
      
      expect(tasks[0].input.run).toEqual(input);
      expect(tasks[0].input.process).toEqual(processOutput);
      // Note: save step only depends on process, so fetch output is not included (correct behavior)
      expect(tasks[0].input.fetch).toBeUndefined();

      const saveOutput = { 
        saved: true, 
        record_id: 'rec_12345',
        final_count: processOutput.item_count 
      };
      await sqlClient.completeTask(tasks[0], saveOutput);

      // Wait for save completion and run completion
      await saveStep.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
      expect(saveStep.status).toBe(FlowStepStatus.Completed);
      expect(saveStep.output).toEqual(saveOutput);

      // Wait for run completion
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 5000 });
      expect(run.status).toBe(FlowRunStatus.Completed);
      expect(run.remaining_steps).toBe(0);
      expect(run.output).toEqual({ save: saveOutput }); // Final step output becomes run output

      // Verify we received realtime events
      log('=== Event Verification ===');
      log('Total run events received:', receivedRunEvents.length);
      log('Total step events received:', receivedStepEvents.length);

      // Should have received at least the completion event
      // Note: run:started event may fire before listeners are established  
      expect(receivedRunEvents.length).toBeGreaterThanOrEqual(1);
      
      // Should have received events for each step completion (at least 3)
      expect(receivedStepEvents.length).toBeGreaterThanOrEqual(3);

      // Verify specific events were received
      const runCompletedEvents = receivedRunEvents.filter(e => e.status === FlowRunStatus.Completed);
      expect(runCompletedEvents.length).toBe(1);

      const fetchCompletedEvents = receivedStepEvents.filter(e => 
        e.step === 'fetch' && e.event.status === FlowStepStatus.Completed
      );
      const processCompletedEvents = receivedStepEvents.filter(e => 
        e.step === 'process' && e.event.status === FlowStepStatus.Completed
      );
      const saveCompletedEvents = receivedStepEvents.filter(e => 
        e.step === 'save' && e.event.status === FlowStepStatus.Completed
      );

      expect(fetchCompletedEvents.length).toBe(1);
      expect(processCompletedEvents.length).toBe(1);
      expect(saveCompletedEvents.length).toBe(1);

      // Verify no tasks remain
      const remainingTasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 1);
      expect(remainingTasks).toHaveLength(0);

      log('=== Happy Path E2E Test Completed Successfully ===');
      await supabaseClient.removeAllChannels();
    }),
    30000 // Allow extra time for 3-step completion
  );
});
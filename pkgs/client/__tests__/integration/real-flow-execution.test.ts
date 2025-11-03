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
import { createEventTracker } from '../helpers/test-utils.js';

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

      // Track events with EventTracker
      const runTracker = createEventTracker();
      const stepTracker = createEventTracker();

      run.on('*', runTracker.callback);
      const step = run.step('event_step');
      step.on('*', stepTracker.callback);

      // Give realtime subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Poll and complete task
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      await sqlClient.completeTask(tasks[0], { hello: 'world' });

      // Wait for completion
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 15000 });
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 15000 });

      // Verify run events with payload matching
      expect(runTracker).toHaveReceivedEvent('run:completed', {
        run_id: run.run_id,
        flow_slug: testFlow.slug,
        status: FlowRunStatus.Completed,
      });

      // Verify step events with payload matching
      expect(stepTracker).toHaveReceivedEvent('step:completed', {
        run_id: run.run_id,
        step_slug: 'event_step',
        status: FlowStepStatus.Completed,
        output: { hello: 'world' },
      });

      // Verify we received exactly the expected events
      expect(runTracker).toHaveReceivedEventCount('run:completed', 1);
      expect(stepTracker).toHaveReceivedEventCount('step:completed', 1);

      await supabaseClient.removeAllChannels();
    }),
    10000
  );

  it(
    'CRITICAL: broadcasts step:started events (CTE optimization bug check)',
    withPgNoTransaction(async (sql) => {
      // This test specifically verifies that step:started events ARE broadcast
      // It SHOULD FAIL until the CTE optimization bug is fixed in start_ready_steps()

      const testFlow = createTestFlow('started_event_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'test_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'data' });
      const step = run.step('test_step');

      // Track ALL step events with event matchers
      const tracker = createEventTracker();
      step.on('*', tracker.callback);

      // Give realtime subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Execute the step - this calls start_ready_steps() which should broadcast step:started
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);

      // Wait a moment for broadcast to propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      // Complete the task
      await sqlClient.completeTask(tasks[0], { result: 'done' });
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });

      // CRITICAL ASSERTIONS: Verify step:started WAS broadcast
      // These will FAIL with the current CTE optimization bug!
      expect(tracker).toHaveReceivedEvent('step:started', {
        run_id: run.run_id,
        step_slug: 'test_step',
        status: FlowStepStatus.Started,
      });

      // Verify proper event sequence
      expect(tracker).toHaveReceivedEventSequence(['step:started', 'step:completed']);
      expect(tracker).toHaveReceivedInOrder('step:started', 'step:completed');

      // Verify both events were received
      expect(tracker).toHaveReceivedEventCount('step:started', 1);
      expect(tracker).toHaveReceivedEventCount('step:completed', 1);

      await supabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'empty map steps: skip step:started and go straight to step:completed',
    withPgNoTransaction(async (sql) => {
      // This test verifies the EXPECTED behavior for empty map steps
      // They should NOT send step:started, only step:completed

      const testFlow = createTestFlow('empty_map_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      // Create a map step (will complete immediately with empty array input)
      await sql`SELECT pgflow.add_step(
        ${testFlow.slug},
        'empty_map_step',
        ARRAY[]::text[],
        NULL,
        NULL,
        NULL,
        NULL,
        'map'
      )`;

      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Start flow with empty array directly (root map steps expect array input)
      const run = await pgflowClient.startFlow(testFlow.slug, []);
      const step = run.step('empty_map_step');

      // Track events
      const tracker = createEventTracker();
      step.on('*', tracker.callback);

      // Give realtime time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Wait for step to complete (should happen immediately)
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });

      // Verify NO step:started event (expected for empty maps)
      expect(tracker).toNotHaveReceivedEvent('step:started');

      // Verify step:completed was sent
      expect(tracker).toHaveReceivedEvent('step:completed', {
        run_id: run.run_id,
        step_slug: 'empty_map_step',
        status: FlowStepStatus.Completed,
      });

      // Verify only 1 event total
      expect(tracker).toHaveReceivedTotalEvents(1);

      await supabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'waitForStatus(Started): waits for step to reach Started status',
    withPgNoTransaction(async (sql) => {
      // This test verifies that waitForStatus works correctly for Started status
      // Note: Root steps (no dependencies) are started immediately by start_flow()

      const testFlow = createTestFlow('wait_started_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'test_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'data' });
      const step = run.step('test_step');

      // Root steps are started immediately - verify step is in Started status
      expect(step.status).toBe(FlowStepStatus.Started);
      expect(step.started_at).toBeDefined();

      // Give realtime subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      // waitForStatus should resolve immediately since step is already Started
      const waitPromise = step.waitForStatus(FlowStepStatus.Started, { timeoutMs: 5000 });
      const result = await waitPromise;
      expect(result).toBe(step);
      expect(step.status).toBe(FlowStepStatus.Started);

      // Poll for task to ensure step execution is progressing
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      // Complete the task for cleanup
      await sqlClient.completeTask(tasks[0], { result: 'done' });
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });

      await supabaseClient.removeAllChannels();
    }),
    15000
  );
});

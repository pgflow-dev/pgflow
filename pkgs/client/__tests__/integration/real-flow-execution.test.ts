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
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const input = { data: 'test-input' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      expect(run.run_id).toBeDefined();
      expect(run.flow_slug).toBe(testFlow.slug);

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
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 15000 });

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
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 15000 });

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
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const input = { foo: 'bar' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Track events with EventTracker
      const runTracker = createEventTracker();
      const stepTracker = createEventTracker();

      run.on('*', runTracker.callback);
      const step = run.step('event_step');
      step.on('*', stepTracker.callback);

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
    'root steps: started immediately (verify via waitForStatus, not broadcasts)',
    withPgNoTransaction(async (sql) => {
      // Root steps are started in the same transaction as start_flow()
      // By the time startFlow() returns, they're already Started
      // We can't observe these broadcasts - they happen before we can listen
      // Instead, verify the state directly

      const testFlow = createTestFlow('root_started_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'root_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      // Start flow - root step starts in this transaction
      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'data' });
      const step = run.step('root_step');

      // VERIFY: Step is already Started when startFlow() returns
      expect(step.status).toBe(FlowStepStatus.Started);
      expect(step.started_at).toBeDefined();

      // waitForStatus should return immediately (already Started)
      await step.waitForStatus(FlowStepStatus.Started, { timeoutMs: 1000 });

      // Complete for cleanup
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      await sqlClient.completeTask(tasks[0], { result: 'done' });
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });

      await supabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'dependent steps: broadcasts step:started when they become ready',
    withPgNoTransaction(async (sql) => {
      // Dependent steps start AFTER their dependencies complete
      // This happens AFTER startFlow() returns, so we CAN observe broadcasts
      // This is the real test for step:started broadcasts!

      const testFlow = createTestFlow('dependent_started_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'root_step')`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'dependent_step', ARRAY['root_step'])`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      // Start flow - only root_step starts
      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'data' });
      const rootStep = run.step('root_step');
      const dependentStep = run.step('dependent_step');

      // Root is started, dependent is still created (waiting for deps)
      expect(rootStep.status).toBe(FlowStepStatus.Started);
      expect(dependentStep.status).toBe(FlowStepStatus.Created);

      // NOW set up event tracker (before completing root)
      const tracker = createEventTracker();
      dependentStep.on('*', tracker.callback);

      // Complete root step - this will trigger dependent_step to start
      const rootTasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(rootTasks[0].step_slug).toBe('root_step');
      await sqlClient.completeTask(rootTasks[0], { result: 'root done' });

      // Wait for dependent to start
      await dependentStep.waitForStatus(FlowStepStatus.Started, {
        timeoutMs: 5000,
      });

      // VERIFY: We received step:started broadcast for dependent step
      expect(tracker).toHaveReceivedEvent('step:started', {
        run_id: run.run_id,
        step_slug: 'dependent_step',
        status: FlowStepStatus.Started,
      });

      // Complete dependent step
      const dependentTasks = await readAndStart(
        sql,
        sqlClient,
        testFlow.slug,
        1,
        5
      );
      expect(dependentTasks[0].step_slug).toBe('dependent_step');
      await sqlClient.completeTask(dependentTasks[0], {
        result: 'dependent done',
      });

      // Wait for completion
      await dependentStep.waitForStatus(FlowStepStatus.Completed, {
        timeoutMs: 5000,
      });

      // VERIFY: Proper event sequence
      expect(tracker).toHaveReceivedEventSequence([
        'step:started',
        'step:completed',
      ]);
      expect(tracker).toHaveReceivedInOrder('step:started', 'step:completed');
      expect(tracker).toHaveReceivedEventCount('step:started', 1);
      expect(tracker).toHaveReceivedEventCount('step:completed', 1);

      await supabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'empty map steps (root): completed immediately (verify via state)',
    withPgNoTransaction(async (sql) => {
      // Empty map steps with no tasks complete immediately
      // Root empty maps complete in the start_flow transaction
      // Can't observe broadcasts - verify state instead

      const testFlow = createTestFlow('root_empty_map_flow');
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
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      // Start flow with empty array (root map steps expect array input)
      const run = await pgflowClient.startFlow(testFlow.slug, []);
      const step = run.step('empty_map_step');

      // VERIFY: Step is already Completed when startFlow() returns
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.completed_at).toBeDefined();

      // Empty maps DO get started_at set (they transition through started briefly)
      expect(step.started_at).toBeDefined();

      await supabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'empty map steps (dependent): broadcasts step:completed when triggered',
    withPgNoTransaction(async (sql) => {
      // Dependent empty map steps complete AFTER their dependencies
      // This happens AFTER startFlow() returns, so we CAN observe broadcasts
      // They skip step:started and go directly to step:completed

      const testFlow = createTestFlow('dependent_empty_map_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'root_step')`;
      // Dependent map step that will receive empty array from root
      await sql`SELECT pgflow.add_step(
        ${testFlow.slug},
        'dependent_empty_map',
        ARRAY['root_step'],
        NULL,
        NULL,
        NULL,
        NULL,
        'map'
      )`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'data' });
      const rootStep = run.step('root_step');
      const emptyMapStep = run.step('dependent_empty_map');

      // Set up tracker before completing root
      const tracker = createEventTracker();
      emptyMapStep.on('*', tracker.callback);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Complete root with empty array (single steps feeding map steps output arrays directly)
      const rootTasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      await sqlClient.completeTask(rootTasks[0], []);

      // Wait for dependent to complete (should happen immediately)
      await emptyMapStep.waitForStatus(FlowStepStatus.Completed, {
        timeoutMs: 5000,
      });

      // VERIFY: NO step:started (empty maps skip this)
      expect(tracker).toNotHaveReceivedEvent('step:started');

      // VERIFY: Received step:completed directly
      expect(tracker).toHaveReceivedEvent('step:completed', {
        run_id: run.run_id,
        step_slug: 'dependent_empty_map',
        status: FlowStepStatus.Completed,
      });

      // VERIFY: Only 1 event total (completed, no started)
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
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'data' });
      const step = run.step('test_step');

      // Root steps are started immediately - verify step is in Started status
      expect(step.status).toBe(FlowStepStatus.Started);
      expect(step.started_at).toBeDefined();

      // waitForStatus should resolve immediately since step is already Started
      const waitPromise = step.waitForStatus(FlowStepStatus.Started, {
        timeoutMs: 5000,
      });
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

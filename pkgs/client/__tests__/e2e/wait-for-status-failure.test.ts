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

describe('waitForStatus - Failure Scenarios', () => {
  it(
    'step.waitForStatus(Failed): waits for step to reach Failed status',
    withPgNoTransaction(async (sql) => {
      // Test that waitForStatus correctly waits for a step to fail
      // IMPORTANT: max_attempts = 1 ensures immediate failure without retries

      const testFlow = createTestFlow('wait_failed_step_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug}, max_attempts => 1)`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'failing_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'will-fail' });
      const step = run.step('failing_step');

      // Track events to verify broadcasting
      const stepTracker = createEventTracker();
      step.on('*', stepTracker.callback);

      // Start waiting for Failed status (before the step actually fails)
      const waitPromise = step.waitForStatus(FlowStepStatus.Failed, { timeoutMs: 10000 });

      // Execute the step and then fail it
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      // Fail the task
      const errorMessage = 'Step execution failed intentionally';
      await sqlClient.failTask(tasks[0], errorMessage);

      // Wait for the step to reach Failed status
      const result = await waitPromise;
      expect(result).toBe(step);
      expect(step.status).toBe(FlowStepStatus.Failed);
      expect(step.error_message).toBe(errorMessage);
      expect(step.failed_at).toBeDefined();

      // Verify step:failed event was broadcast
      expect(stepTracker).toHaveReceivedEvent('step:failed', {
        run_id: run.run_id,
        step_slug: 'failing_step',
        status: FlowStepStatus.Failed,
        error_message: errorMessage,
      });

      await supabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'run.waitForStatus(Failed): waits for run to reach Failed status',
    withPgNoTransaction(async (sql) => {
      // Test that waitForStatus correctly waits for a run to fail
      // IMPORTANT: max_attempts = 1 ensures immediate failure without retries

      const testFlow = createTestFlow('wait_failed_run_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug}, max_attempts => 1)`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'failing_step')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'run-will-fail' });

      // Track events to verify broadcasting
      const runTracker = createEventTracker();
      run.on('*', runTracker.callback);

      // Start waiting for Failed status (before the run actually fails)
      const waitPromise = run.waitForStatus(FlowRunStatus.Failed, { timeoutMs: 10000 });

      // Execute the step and then fail it (which will fail the run)
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      // Fail the task
      const errorMessage = 'Run execution failed intentionally';
      await sqlClient.failTask(tasks[0], errorMessage);

      // Wait for the run to reach Failed status
      const result = await waitPromise;
      expect(result).toBe(run);
      expect(run.status).toBe(FlowRunStatus.Failed);
      expect(run.error_message).toBeDefined();
      expect(run.failed_at).toBeDefined();

      // Verify run:failed event was broadcast
      expect(runTracker).toHaveReceivedEvent('run:failed', {
        run_id: run.run_id,
        status: FlowRunStatus.Failed,
      });

      await supabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'waitForStatus timeout: handles timeout when failure does not occur',
    withPgNoTransaction(async (sql) => {
      // Test that waitForStatus times out correctly when the expected failure never happens

      const testFlow = createTestFlow('timeout_test_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'normal_step')`;

      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'timeout' });
      const step = run.step('normal_step');

      // Wait for Failed status with a short timeout (step will complete normally, not fail)
      const waitPromise = step.waitForStatus(FlowStepStatus.Failed, { timeoutMs: 2000 });

      // Start the task but complete it successfully instead of failing
      const sqlClient = new PgflowSqlClient(sql);
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      await sqlClient.completeTask(tasks[0], { result: 'success' });

      // Wait for completion to ensure the step doesn't fail
      await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });

      // The waitForStatus(Failed) should timeout since the step completed successfully
      await expect(waitPromise).rejects.toThrow(/Timeout waiting for step/);

      await supabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'multiple failures: handles step failure followed by run failure',
    withPgNoTransaction(async (sql) => {
      // Test the complete failure lifecycle: step fails -> run fails
      // IMPORTANT: max_attempts = 1 ensures immediate failure without retries

      const testFlow = createTestFlow('multi_failure_flow');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);
      await sql`SELECT pgflow.create_flow(${testFlow.slug}, max_attempts => 1)`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'step_one')`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'multi-fail' });
      const step = run.step('step_one');

      // Track events for both run and step
      const runTracker = createEventTracker();
      const stepTracker = createEventTracker();
      run.on('*', runTracker.callback);
      step.on('*', stepTracker.callback);

      // Wait for both step and run to fail
      const stepWaitPromise = step.waitForStatus(FlowStepStatus.Failed, { timeoutMs: 10000 });
      const runWaitPromise = run.waitForStatus(FlowRunStatus.Failed, { timeoutMs: 10000 });

      // Execute and fail the task
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      const errorMessage = 'Cascading failure test';
      await sqlClient.failTask(tasks[0], errorMessage);

      // Wait for both to fail
      await Promise.all([stepWaitPromise, runWaitPromise]);

      // Verify both reached Failed status
      expect(step.status).toBe(FlowStepStatus.Failed);
      expect(run.status).toBe(FlowRunStatus.Failed);

      // Verify run:failed event was broadcast
      expect(runTracker).toHaveReceivedEvent('run:failed');

      // Verify step:failed event was broadcast (on step tracker, not run tracker)
      expect(stepTracker).toHaveReceivedEvent('step:failed');

      await supabaseClient.removeAllChannels();
    }),
    15000
  );
});

import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowStepStatus } from '../../src/lib/types.js';
import { cleanupFlow } from '../helpers/cleanup.js';
import { createEventTracker } from '../helpers/test-utils.js';
import { skipStep } from '../helpers/skip-step.js';

/**
 * Tests for skipped step event handling in the client.
 *
 * Skipped steps can occur when:
 * - A step's condition evaluates to false (condition_unmet)
 * - A dependency was skipped, causing cascading skips (dependency_skipped)
 * - A handler fails during evaluation (handler_failed)
 *
 * These tests verify the client correctly:
 * - Receives and processes skipped broadcast events
 * - Updates step state with skipped_at and skip_reason
 * - Treats skipped as a terminal state
 * - Handles waitForStatus(Skipped) correctly
 */
describe('Skipped Step Handling', () => {
  it(
    'client handles skipped step state from database snapshot',
    withPgNoTransaction(async (sql) => {
      // This test verifies the client correctly handles skipped step state
      // when fetched from the database (e.g., on reconnect or late join)

      const testFlow = createTestFlow('skip_snap');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'will_skip_step')`;

      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      // Start the flow
      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'data' });
      const step = run.step('will_skip_step');

      // Verify initial state is Started (root step)
      expect(step.status).toBe(FlowStepStatus.Started);

      // Directly call pgflow.skip_step to simulate the step being skipped
      // This mimics what would happen when a condition evaluates to false
      await skipStep(sql, run.run_id, 'will_skip_step', 'condition_unmet');

      // Wait for the skipped event to be received
      await step.waitForStatus(FlowStepStatus.Skipped, { timeoutMs: 10000 });

      // Verify skipped state
      expect(step.status).toBe(FlowStepStatus.Skipped);
      expect(step.skipped_at).toBeInstanceOf(Date);
      expect(step.skip_reason).toBe('condition_unmet');

      // Verify output is null for skipped steps (per design decision Q1)
      expect(step.output).toBeNull();

      await supabaseClient.removeAllChannels();
    }),
    { timeout: 15000 }
  );

  it(
    'receives skipped broadcast event and updates step state',
    withPgNoTransaction(async (sql) => {
      // This test verifies the client receives and processes skipped events
      // broadcast via Supabase realtime

      const testFlow = createTestFlow('skip_broadcast');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'skipped_step')`;

      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'data' });
      const step = run.step('skipped_step');

      // Set up event tracking BEFORE the skip happens
      const tracker = createEventTracker();
      step.on('*', tracker.callback);

      // Skip the step
      await skipStep(sql, run.run_id, 'skipped_step', 'handler_failed');

      // Wait for the skipped status
      await step.waitForStatus(FlowStepStatus.Skipped, { timeoutMs: 10000 });

      // Verify we received the skipped event
      expect(tracker).toHaveReceivedEvent('step:skipped');
      expect(tracker).toHaveReceivedEvent('step:skipped', {
        run_id: run.run_id,
        step_slug: 'skipped_step',
        status: FlowStepStatus.Skipped,
        skip_reason: 'handler_failed',
      });

      // Verify step state
      expect(step.status).toBe(FlowStepStatus.Skipped);
      expect(step.skip_reason).toBe('handler_failed');

      await supabaseClient.removeAllChannels();
    }),
    { timeout: 15000 }
  );

  it(
    'waitForStatus(Skipped) resolves when step is skipped',
    withPgNoTransaction(async (sql) => {
      // Verify waitForStatus works correctly with Skipped status

      const testFlow = createTestFlow('wait_skip');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'wait_step')`;

      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient, {
        realtimeStabilizationDelayMs: 1000,
      });

      const run = await pgflowClient.startFlow(testFlow.slug, { test: 'data' });
      const step = run.step('wait_step');

      // Start waiting for skipped BEFORE the skip happens
      const waitPromise = step.waitForStatus(FlowStepStatus.Skipped, {
        timeoutMs: 10000,
      });

      // Skip the step after a small delay
      setTimeout(async () => {
        await skipStep(sql, run.run_id, 'wait_step', 'condition_unmet');
      }, 100);

      // Wait should resolve with the step
      const result = await waitPromise;
      expect(result).toBe(step);
      expect(result.status).toBe(FlowStepStatus.Skipped);
      expect(result.skip_reason).toBe('condition_unmet');

      await supabaseClient.removeAllChannels();
    }),
    { timeout: 15000 }
  );

  it(
    'handles all skip reasons correctly',
    withPgNoTransaction(async (sql) => {
      // Verify all three skip reasons are handled correctly

      const skipReasons = [
        'condition_unmet',
        'handler_failed',
        'dependency_skipped',
      ] as const;

      for (const skipReason of skipReasons) {
        const testFlow = createTestFlow(`skip_${skipReason}`);
        await cleanupFlow(sql, testFlow.slug);
        await grantMinimalPgflowPermissions(sql);

        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'reason_step')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient, {
          realtimeStabilizationDelayMs: 1000,
        });

        const run = await pgflowClient.startFlow(testFlow.slug, {
          test: 'data',
        });
        const step = run.step('reason_step');

        // Skip with specific reason
        await skipStep(sql, run.run_id, 'reason_step', skipReason);

        await step.waitForStatus(FlowStepStatus.Skipped, { timeoutMs: 10000 });

        // Verify the skip reason was captured correctly
        expect(step.status).toBe(FlowStepStatus.Skipped);
        expect(step.skip_reason).toBe(skipReason);

        await supabaseClient.removeAllChannels();
      }
    }),
    { timeout: 45000 }
  );
});

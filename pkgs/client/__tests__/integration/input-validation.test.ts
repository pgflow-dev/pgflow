import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types.js';
import { cleanupFlow } from '../helpers/cleanup.js';
import { PgflowSqlClient } from '@pgflow/core';
import { readAndStart } from '../helpers/polling.js';
import { createEventTracker } from '../helpers/test-utils.js';

describe('Input Validation', () => {
  it(
    'rejects non-array input for root map steps before creating run',
    withPgNoTransaction(async (sql) => {
      // Setup: Create flow with root map step
      const testFlow = createTestFlow('validation_root_map');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(
        ${testFlow.slug},
        'map_step',
        ARRAY[]::text[],
        NULL,
        NULL,
        NULL,
        NULL,
        'map'
      )`;

      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Act & Assert: Should throw validation error
      await expect(
        pgflowClient.startFlow(testFlow.slug, { items: [] })  // Object, not array
      ).rejects.toThrow(/has root map steps but input is not an array/);

      // Verify no run was created (validation failed before run creation)
      const runs = await sql`
        SELECT * FROM pgflow.runs WHERE flow_slug = ${testFlow.slug}
      `;
      expect(runs.length).toBe(0);

      // Verify no step states were created
      const stepStates = await sql`
        SELECT * FROM pgflow.step_states WHERE flow_slug = ${testFlow.slug}
      `;
      expect(stepStates.length).toBe(0);

      await supabaseClient.removeAllChannels();
    }),
    10000
  );

  it(
    'accepts empty array input for root map steps',
    withPgNoTransaction(async (sql) => {
      // Setup: Create flow with root map step
      const testFlow = createTestFlow('validation_empty_array');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(
        ${testFlow.slug},
        'map_step',
        ARRAY[]::text[],
        NULL,
        NULL,
        NULL,
        NULL,
        'map'
      )`;

      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Act: Should succeed with empty array
      const run = await pgflowClient.startFlow(testFlow.slug, []);  // ✓ Valid array

      // Assert: Run was created successfully
      expect(run.run_id).toBeDefined();
      expect(run.flow_slug).toBe(testFlow.slug);

      // Verify run exists in database
      const runs = await sql`
        SELECT * FROM pgflow.runs WHERE run_id = ${run.run_id}
      `;
      expect(runs.length).toBe(1);

      await supabaseClient.removeAllChannels();
    }),
    10000
  );

  it(
    'accepts non-empty array input for root map steps',
    withPgNoTransaction(async (sql) => {
      // Setup: Create flow with root map step
      const testFlow = createTestFlow('validation_nonempty_array');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(
        ${testFlow.slug},
        'map_step',
        ARRAY[]::text[],
        NULL,
        NULL,
        NULL,
        NULL,
        'map'
      )`;

      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Act: Should succeed with array of items
      const input = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Assert: Run was created successfully
      expect(run.run_id).toBeDefined();
      expect(run.flow_slug).toBe(testFlow.slug);
      expect(run.input).toEqual(input);

      // Verify run exists in database with correct input
      const runs = await sql`
        SELECT * FROM pgflow.runs WHERE run_id = ${run.run_id}
      `;
      expect(runs.length).toBe(1);
      expect(runs[0].input).toEqual(input);

      await supabaseClient.removeAllChannels();
    }),
    10000
  );

  it(
    'accepts object input for flows without root map steps',
    withPgNoTransaction(async (sql) => {
      // Setup: Create flow with regular (non-map) root step
      const testFlow = createTestFlow('validation_single_step');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'regular_step')`;  // Single step

      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      // Act: Should succeed with object input (no root map validation)
      const input = { items: [], foo: 'bar' };
      const run = await pgflowClient.startFlow(testFlow.slug, input);

      // Assert: Run was created successfully
      expect(run.run_id).toBeDefined();
      expect(run.flow_slug).toBe(testFlow.slug);
      expect(run.input).toEqual(input);

      // Verify run exists in database
      const runs = await sql`
        SELECT * FROM pgflow.runs WHERE run_id = ${run.run_id}
      `;
      expect(runs.length).toBe(1);

      await supabaseClient.removeAllChannels();
    }),
    10000
  );

  // =========================================================================
  // Dependent Map Type Validation Tests
  // =========================================================================

  it(
    'CRITICAL: broadcasts step:failed and run:failed when dependency produces non-array for dependent map',
    withPgNoTransaction(async (sql) => {
      // This test verifies that type violations for dependent maps
      // broadcast failure events (currently they do NOT - this is a bug)

      // Setup: Create flow with single step -> dependent map step
      const testFlow = createTestFlow('dep_map_type_err');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'producer')`;  // Single step
      await sql`SELECT pgflow.add_step(
        ${testFlow.slug},
        'consumer_map',
        ARRAY['producer']::text[],
        NULL,
        NULL,
        NULL,
        NULL,
        'map'
      )`;  // Dependent map step

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const run = await pgflowClient.startFlow(testFlow.slug, { data: 'test' });

      // Track events
      const runTracker = createEventTracker();
      const stepTracker = createEventTracker();
      run.on('*', runTracker.callback);
      run.step('producer').on('*', stepTracker.callback);

      // Give realtime subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Execute the producer step
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      // Complete with INVALID output (object instead of array)
      const invalidOutput = { items: [1, 2, 3] };  // Object, not array!
      await sqlClient.completeTask(tasks[0], invalidOutput);

      // Wait for events to propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      // CRITICAL ASSERTIONS: Verify failure events WERE broadcast
      // These will FAIL until complete_task.sql is fixed to send events!

      // Should receive step:failed event for the producer
      expect(stepTracker).toHaveReceivedEvent('step:failed', {
        run_id: run.run_id,
        step_slug: 'producer',
        status: FlowStepStatus.Failed,
      });

      // Should receive run:failed event
      expect(runTracker).toHaveReceivedEvent('run:failed', {
        run_id: run.run_id,
        flow_slug: testFlow.slug,
        status: FlowRunStatus.Failed,
      });

      // Verify database state (this should pass - state is updated correctly)
      const runState = await sql`
        SELECT status, failed_at FROM pgflow.runs WHERE run_id = ${run.run_id}
      `;
      expect(runState[0].status).toBe('failed');
      expect(runState[0].failed_at).not.toBeNull();

      const stepState = await sql`
        SELECT status, failed_at, error_message
        FROM pgflow.step_states
        WHERE run_id = ${run.run_id} AND step_slug = 'producer'
      `;
      expect(stepState[0].status).toBe('failed');
      expect(stepState[0].failed_at).not.toBeNull();
      expect(stepState[0].error_message).toMatch(/TYPE_VIOLATION/);

      await supabaseClient.removeAllChannels();
    }),
    15000
  );

  it(
    'accepts array output from dependency for dependent map step',
    withPgNoTransaction(async (sql) => {
      // Setup: Create flow with single step -> dependent map step
      const testFlow = createTestFlow('dep_map_ok');
      await cleanupFlow(sql, testFlow.slug);
      await grantMinimalPgflowPermissions(sql);

      await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
      await sql`SELECT pgflow.add_step(${testFlow.slug}, 'producer')`;
      await sql`SELECT pgflow.add_step(
        ${testFlow.slug},
        'consumer_map',
        ARRAY['producer']::text[],
        NULL,
        NULL,
        NULL,
        NULL,
        'map'
      )`;

      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const run = await pgflowClient.startFlow(testFlow.slug, { data: 'test' });

      // Give realtime subscription time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Execute the producer step
      const tasks = await readAndStart(sql, sqlClient, testFlow.slug, 1, 5);
      expect(tasks).toHaveLength(1);

      // Complete with VALID output (array)
      const validOutput = [{ id: 1 }, { id: 2 }, { id: 3 }];
      await sqlClient.completeTask(tasks[0], validOutput);

      // Wait for step to complete
      await run.step('producer').waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });

      // Verify step completed successfully (not failed)
      const stepState = await sql`
        SELECT status, failed_at, error_message
        FROM pgflow.step_states
        WHERE run_id = ${run.run_id} AND step_slug = 'producer'
      `;
      expect(stepState[0].status).toBe('completed');
      expect(stepState[0].failed_at).toBeNull();
      expect(stepState[0].error_message).toBeNull();

      // Verify dependent map step has correct initial_tasks
      const consumerMapState = await sql`
        SELECT status, initial_tasks
        FROM pgflow.step_states
        WHERE run_id = ${run.run_id} AND step_slug = 'consumer_map'
      `;
      expect(consumerMapState[0].initial_tasks).toBe(3);  // Array length

      await supabaseClient.removeAllChannels();
    }),
    15000
  );
});

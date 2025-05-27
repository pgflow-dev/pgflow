import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types.js';

describe('Flow Lifecycle Integration', () => {
  describe('Complete Flow Execution', () => {
    it(
      'executes a simple flow from start to completion',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow = createTestFlow('simple_flow');
        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'first_step')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const input = { url: 'https://example.com' };
        const run = await pgflowClient.startFlow(testFlow.slug, input);

        expect(run).toBeDefined();
        expect(run.flow_slug).toBe(testFlow.slug);
        expect(run.status).toBe(FlowRunStatus.Started);
        expect(run.input).toEqual(input);

        await supabaseClient.removeAllChannels();
      }),
      10000
    );

    it(
      'handles flow completion through multiple steps',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow = createTestFlow('multi_step_flow');
        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'step_one')`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'step_two')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const run = await pgflowClient.startFlow(testFlow.slug, { data: 'test' });

        const step1 = run.step('step_one');
        const step2 = run.step('step_two');

        expect(step1.step_slug).toBe('step_one');
        expect(step2.step_slug).toBe('step_two');
        expect(step1.run_id).toBe(run.run_id);
        expect(step2.run_id).toBe(run.run_id);

        await supabaseClient.removeAllChannels();
      }),
      10000
    );

    it(
      'maintains state consistency during flow execution',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow = createTestFlow('consistency_flow');
        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'step_one')`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'step_two')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const run = await pgflowClient.startFlow(testFlow.slug, { data: 'consistency-test' });

        const step1 = run.step('step_one');
        const step2 = run.step('step_two');

        expect(run.run_id).toBe(step1.run_id);
        expect(run.run_id).toBe(step2.run_id);
        
        const step1Again = run.step('step_one');
        const step2Again = run.step('step_two');
        
        expect(step1).toBe(step1Again);
        expect(step2).toBe(step2Again);

        await supabaseClient.removeAllChannels();
      }),
      10000
    );

    it(
      'processes and completes a task through full lifecycle',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow = createTestFlow('complete_lifecycle');
        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'task_step')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const input = { data: 'lifecycle-test' };
        const run = await pgflowClient.startFlow(testFlow.slug, input);

        const tasks = await sql`
          SELECT * FROM pgflow.poll_for_tasks(${testFlow.slug}, 30, 1)
        `;

        expect(tasks).toHaveLength(1);
        expect(tasks[0].run_id).toBe(run.run_id);
        expect(tasks[0].step_slug).toBe('task_step');

        const taskOutput = { result: 'completed successfully' };

        await sql`
          SELECT pgflow.complete_task(
            ${tasks[0].run_id}::uuid,
            ${tasks[0].step_slug},
            0,
            ${taskOutput}::jsonb
          )
        `;

        const step = run.step('task_step');
        await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });

        expect(step.status).toBe(FlowStepStatus.Completed);
        expect(step.output).toEqual(taskOutput);

        await supabaseClient.removeAllChannels();
      }),
      10000
    );
  });

  describe('Flow Error Scenarios', () => {
    it(
      'handles flow start with non-existent flow gracefully',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        await expect(
          pgflowClient.startFlow('nonexistent-flow', { data: 'test' })
        ).rejects.toThrow();

        await supabaseClient.removeAllChannels();
      }),
      10000
    );

    it(
      'handles task failure correctly',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow = createTestFlow('failure_flow');
        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'failing_step')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const run = await pgflowClient.startFlow(testFlow.slug, { data: 'will-fail' });
        expect(run.status).toBe(FlowRunStatus.Started);

        const tasks = await sql`
          SELECT * FROM pgflow.poll_for_tasks(${testFlow.slug}, 30, 1)
        `;

        expect(tasks).toHaveLength(1);

        await sql`
          SELECT pgflow.fail_task(
            ${tasks[0].run_id}::uuid,
            ${tasks[0].step_slug},
            0,
            'Step execution failed'
          )
        `;

        const step = run.step('failing_step');
        await step.waitForStatus(FlowStepStatus.Failed, { timeoutMs: 5000 });

        expect(step.status).toBe(FlowStepStatus.Failed);
        expect(step.error_message).toBe('Step execution failed');

        await supabaseClient.removeAllChannels();
      }),
      10000
    );
  });

  describe('Flow State Retrieval', () => {
    it(
      'retrieves existing flow state correctly',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow = createTestFlow('retrieval_flow');
        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'completed_step')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const originalRun = await pgflowClient.startFlow(testFlow.slug, { data: 'retrieve-test' });

        const tasks = await sql`
          SELECT * FROM pgflow.poll_for_tasks(${testFlow.slug}, 30, 1)
        `;

        const taskOutput = { result: 'step completed' };
        await sql`
          SELECT pgflow.complete_task(
            ${tasks[0].run_id}::uuid,
            ${tasks[0].step_slug},
            0,
            ${taskOutput}::jsonb
          )
        `;

        const step = originalRun.step('completed_step');
        await step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });

        const retrievedRun = await pgflowClient.getRun(originalRun.run_id);

        expect(retrievedRun).toBeDefined();
        expect(retrievedRun.run_id).toBe(originalRun.run_id);

        const retrievedStep = retrievedRun.step('completed_step');
        expect(retrievedStep.status).toBe(FlowStepStatus.Completed);
        expect(retrievedStep.output).toEqual(taskOutput);

        await supabaseClient.removeAllChannels();
      }),
      10000
    );

    it(
      'handles retrieval of non-existent flow',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const run = await pgflowClient.getRun('non-existent-run-id');
        expect(run).toBeNull();

        await supabaseClient.removeAllChannels();
      }),
      10000
    );

    it(
      'caches flow runs correctly',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow = createTestFlow('caching_flow');
        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'cached_step')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const run1 = await pgflowClient.startFlow(testFlow.slug, { data: 'cache-test' });
        const run2 = await pgflowClient.getRun(run1.run_id);

        expect(run2).toBe(run1);

        await supabaseClient.removeAllChannels();
      }),
      10000
    );
  });

  describe('Resource Management Integration', () => {
    it(
      'properly cleans up resources across flow lifecycle',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow1 = createTestFlow('resource_flow_1');
        const testFlow2 = createTestFlow('resource_flow_2');
        
        await sql`SELECT pgflow.create_flow(${testFlow1.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow1.slug}, 'step1')`;
        await sql`SELECT pgflow.create_flow(${testFlow2.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow2.slug}, 'step2')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const run1 = await pgflowClient.startFlow(testFlow1.slug, { data: 'flow1' });
        const run2 = await pgflowClient.startFlow(testFlow2.slug, { data: 'flow2' });

        expect(run1).toBeDefined();
        expect(run2).toBeDefined();
        expect(run1.flow_slug).toBe(testFlow1.slug);
        expect(run2.flow_slug).toBe(testFlow2.slug);

        pgflowClient.dispose(run1.run_id);

        expect(run1.run_id).toBe(run1.run_id);
        
        const run2Again = await pgflowClient.getRun(run2.run_id);
        expect(run2Again).toBe(run2);

        pgflowClient.disposeAll();

        await supabaseClient.removeAllChannels();
      }),
      10000
    );
  });

  describe('Flow Options and Configuration', () => {
    it(
      'handles flow start with custom run_id',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow = createTestFlow('custom_id_flow');
        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'custom_step')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const customRunId = 'custom-run-12345';
        const run = await pgflowClient.startFlow(
          testFlow.slug, 
          { data: 'custom-id-test' }, 
          customRunId
        );

        expect(run.run_id).toBe(customRunId);

        await supabaseClient.removeAllChannels();
      }),
      10000
    );

    it(
      'handles complex input data structures',
      withPgNoTransaction(async (sql) => {
        await grantMinimalPgflowPermissions(sql);

        const testFlow = createTestFlow('complex_input_flow');
        await sql`SELECT pgflow.create_flow(${testFlow.slug})`;
        await sql`SELECT pgflow.add_step(${testFlow.slug}, 'complex_step')`;

        const supabaseClient = createTestSupabaseClient();
        const pgflowClient = new PgflowClient(supabaseClient);

        const complexInput = {
          user: {
            id: 123,
            profile: {
              name: 'Test User',
              preferences: {
                theme: 'dark',
                notifications: true,
              },
            },
          },
          metadata: {
            source: 'api',
            timestamp: new Date().toISOString(),
            tags: ['important', 'urgent'],
          },
          config: {
            retries: 3,
            timeout: 30000,
            endpoints: ['https://api1.com', 'https://api2.com'],
          },
        };

        const run = await pgflowClient.startFlow(testFlow.slug, complexInput);

        expect(run.input).toEqual(complexInput);
        expect(run.input.user.profile.preferences.theme).toBe('dark');
        expect(run.input.metadata.tags).toEqual(['important', 'urgent']);
        expect(run.input.config.endpoints).toHaveLength(2);

        await supabaseClient.removeAllChannels();
      }),
      10000
    );
  });
});
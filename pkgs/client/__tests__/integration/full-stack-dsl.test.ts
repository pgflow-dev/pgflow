import { describe, it, expect } from 'vitest';
import { withPgNoTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { grantMinimalPgflowPermissions } from '../helpers/permissions.js';
import { PgflowClient } from '../../src/lib/PgflowClient.js';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types.js';
import { PgflowSqlClient } from '@pgflow/core';
import { Flow } from '@pgflow/dsl';
import { compileFlow } from '@pgflow/dsl';

describe('Full Stack DSL Integration', () => {
  it(
    'compiles and executes DSL flow end-to-end with proper dependency handling',
    withPgNoTransaction(async (sql) => {
      await grantMinimalPgflowPermissions(sql);

      // 1. Define flow with DSL - simple 3-step dependent flow
      const SimpleFlow = new Flow<{ url: string }>({
        slug: 'simple_dag_test',
      })
        .step({ slug: 'fetch' }, async (_input) => ({
          data: 'fetched content',
          status: 200,
          items: 10,
        }))
        .step({ slug: 'process', dependsOn: ['fetch'] }, async (input) => ({
          processed_data: 'cleaned and validated',
          item_count: input.fetch.items * 2,
          metadata: { stage: 'processed' },
        }))
        .step({ slug: 'save', dependsOn: ['process'] }, async (input) => ({
          saved: true,
          record_id: 'rec_12345',
          final_count: input.process.item_count,
        }));

      // 2. Compile to SQL
      const flowSql = compileFlow(SimpleFlow);
      console.log('Generated SQL statements:', flowSql);

      // 3. Execute SQL to create flow definition
      for (const statement of flowSql) {
        await sql.unsafe(statement);
      }

      // 4. Verify flow was created correctly
      const flows =
        await sql`SELECT * FROM pgflow.flows WHERE flow_slug = ${SimpleFlow.slug}`;
      expect(flows).toHaveLength(1);
      expect(flows[0].flow_slug).toBe(SimpleFlow.slug);

      const steps = await sql`
        SELECT * FROM pgflow.steps
        WHERE flow_slug = ${SimpleFlow.slug}
        ORDER BY step_index
      `;
      expect(steps).toHaveLength(3);
      expect(steps[0].step_slug).toBe('fetch');
      expect(steps[1].step_slug).toBe('process');
      expect(steps[2].step_slug).toBe('save');

      const deps = await sql`
        SELECT * FROM pgflow.deps
        WHERE flow_slug = ${SimpleFlow.slug}
        ORDER BY step_slug, dep_slug
      `;
      expect(deps).toHaveLength(2);
      expect(deps[0].step_slug).toBe('process');
      expect(deps[0].dep_slug).toBe('fetch');
      expect(deps[1].step_slug).toBe('save');
      expect(deps[1].dep_slug).toBe('process');

      // 5. Start flow via client
      const sqlClient = new PgflowSqlClient(sql);
      const supabaseClient = createTestSupabaseClient();
      const pgflowClient = new PgflowClient(supabaseClient);

      const input = { url: 'https://api.example.com/test' };
      const run = await pgflowClient.startFlow(SimpleFlow.slug, input);

      expect(run.run_id).toBeDefined();
      expect(run.flow_slug).toBe(SimpleFlow.slug);
      expect(run.input).toEqual(input);

      // Give realtime subscription time to establish
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 6. Execute the complete flow lifecycle
      console.log('=== Step 1: Completing fetch step ===');
      let tasks = await sqlClient.pollForTasks(SimpleFlow.slug, 1, 5, 200, 30);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].step_slug).toBe('fetch');
      expect(tasks[0].input.run).toEqual(input);

      const fetchOutput = { data: 'fetched content', status: 200, items: 10 };
      await sqlClient.completeTask(tasks[0], fetchOutput);

      const fetchStep = run.step('fetch');
      await fetchStep.waitForStatus(FlowStepStatus.Completed, {
        timeoutMs: 5000,
      });
      expect(fetchStep.status).toBe(FlowStepStatus.Completed);
      expect(fetchStep.output).toEqual(fetchOutput);

      console.log('=== Step 2: Completing process step ===');
      tasks = await sqlClient.pollForTasks(SimpleFlow.slug, 1, 5, 200, 30);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].step_slug).toBe('process');
      expect(tasks[0].input.run).toEqual(input);
      expect(tasks[0].input.fetch).toEqual(fetchOutput); // Critical: dependency output included

      const processOutput = {
        processed_data: 'cleaned and validated',
        item_count: fetchOutput.items * 2,
        metadata: { stage: 'processed' },
      };
      await sqlClient.completeTask(tasks[0], processOutput);

      const processStep = run.step('process');
      await processStep.waitForStatus(FlowStepStatus.Completed, {
        timeoutMs: 5000,
      });
      expect(processStep.status).toBe(FlowStepStatus.Completed);
      expect(processStep.output).toEqual(processOutput);

      console.log('=== Step 3: Completing save step ===');
      tasks = await sqlClient.pollForTasks(SimpleFlow.slug, 1, 5, 200, 30);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].step_slug).toBe('save');
      expect(tasks[0].input.run).toEqual(input);

      // The save step only depends on process, so it should only have process output
      // This is correct behavior - transitive dependencies are not automatically included
      expect(tasks[0].input.process).toEqual(processOutput); // Direct dependency
      expect(tasks[0].input.fetch).toBeUndefined(); // Not a direct dependency

      const saveOutput = {
        saved: true,
        record_id: 'rec_12345',
        final_count: processOutput.item_count,
      };
      await sqlClient.completeTask(tasks[0], saveOutput);

      const saveStep = run.step('save');
      await saveStep.waitForStatus(FlowStepStatus.Completed, {
        timeoutMs: 5000,
      });
      expect(saveStep.status).toBe(FlowStepStatus.Completed);
      expect(saveStep.output).toEqual(saveOutput);

      // 7. Verify flow completion
      await run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 5000 });
      expect(run.status).toBe(FlowRunStatus.Completed);
      expect(run.remaining_steps).toBe(0);

      console.log('=== Full Stack DSL Test Completed Successfully ===');
      await supabaseClient.removeAllChannels();
    }),
    30000
  );
});

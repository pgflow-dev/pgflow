import { assertEquals } from '@std/assert';
import { withTransaction } from '../db.ts';
import { delay } from '@std/async';
import type { WorkerRow } from '../../src/core/types.ts';
import { Flow } from '@pgflow/dsl';
import { startWorker } from './_helpers.ts';

// Create a simple test flow that tracks executions
const createTestFlow = (flowName: string, executions: { step1: number; step2: number }) => {
  return new Flow<{ value: number }>({ slug: flowName })
    .step({ slug: 'step1' }, async (input) => {
      executions.step1++;
      await delay(50);
      return { result: input.run.value * 2 };
    })
    .step(
      { slug: 'step2', dependsOn: ['step1'] },
      async (input) => {
        executions.step2++;
        await delay(50);
        return { final: input.step1.result + 10 };
      }
    );
};

Deno.test(
  'Flow worker deprecation - should stop polling when deprecated',
  withTransaction(async (sql) => {
    const flowSlug = 'test_flow_dep_' + crypto.randomUUID().slice(0, 8);
    const queueName = flowSlug;
    const functionName = 'test_flow';
    
    // Track step executions
    const executions = { step1: 0, step2: 0 };
    const flow = createTestFlow(flowSlug, executions);
    
    // Create the flow structure in the database
    await sql`select pgflow.create_flow(${flowSlug}::text)`;
    await sql`select pgflow.add_step(${flowSlug}::text, 'step1'::text)`;
    await sql`select pgflow.add_step(${flowSlug}::text, 'step2'::text, ARRAY['step1']::text[], null, null, null, null)`;
    
    // Start the flow worker
    const worker = startWorker(sql, flow, {
      maxPollSeconds: 1,
      pollIntervalMs: 50,
    });

    // Wait for worker to start and get registered
    await delay(300);
    
    // Get the worker ID from the database
    const [workerRow] = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE queue_name = ${queueName}
      AND deprecated_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `;
    
    assertEquals(workerRow.deprecated_at, null);
    assertEquals(workerRow.queue_name, flowSlug);
    const workerId = workerRow.worker_id;

    // Start a few flow runs
    const run1 = await sql`select pgflow.start_flow(${flowSlug}::text, ${JSON.stringify({ value: 10 })}::jsonb)`;
    const run2 = await sql`select pgflow.start_flow(${flowSlug}::text, ${JSON.stringify({ value: 20 })}::jsonb)`;
    
    // Wait for flows to complete
    await delay(1000);
    
    // Verify flows were executed
    const executionsBefore = { ...executions };
    assertEquals(executionsBefore.step1 >= 2, true, 'Step1 should have executed at least twice');
    assertEquals(executionsBefore.step2 >= 2, true, 'Step2 should have executed at least twice');
    
    // Check that runs completed
    const runsBefore = await sql`
      SELECT status, remaining_steps FROM pgflow.runs 
      WHERE flow_slug = ${flowSlug}
      ORDER BY started_at
    `;
    assertEquals(runsBefore.length, 2, 'Should have 2 runs');
    runsBefore.forEach(run => {
      assertEquals(run.status, 'completed', 'Runs should be completed');
      assertEquals(run.remaining_steps, 0, 'No remaining steps');
    });

    // Mark the worker as deprecated
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE worker_id = ${workerId}::uuid
    `;

    // Wait for heartbeat to detect deprecation
    console.log('Waiting for deprecation detection...');
    await delay(6000);

    // Start more flow runs after deprecation
    const run3 = await sql`select pgflow.start_flow(${flowSlug}::text, ${JSON.stringify({ value: 30 })}::jsonb)`;
    const run4 = await sql`select pgflow.start_flow(${flowSlug}::text, ${JSON.stringify({ value: 40 })}::jsonb)`;
    
    // Wait to see if these get processed (they shouldn't)
    await delay(2000);
    
    // Verify no new executions happened
    const executionsAfter = { ...executions };
    assertEquals(
      executionsAfter.step1, 
      executionsBefore.step1, 
      'No new step1 executions should happen after deprecation'
    );
    assertEquals(
      executionsAfter.step2, 
      executionsBefore.step2, 
      'No new step2 executions should happen after deprecation'
    );
    
    // Check that new runs are still pending
    const runsAfter = await sql`
      SELECT run_id, status, remaining_steps FROM pgflow.runs 
      WHERE flow_slug = ${flowSlug}
      AND run_id IN (${run3[0].run_id}::uuid, ${run4[0].run_id}::uuid)
      ORDER BY started_at
    `;
    assertEquals(runsAfter.length, 2, 'Should have 2 new runs');
    runsAfter.forEach(run => {
      assertEquals(run.status, 'started', 'New runs should still be in started state');
      assertEquals(run.remaining_steps > 0, true, 'Should have remaining steps');
    });

    // Verify worker record shows deprecation
    const [workerAfter] = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE worker_id = ${workerId}::uuid
    `;
    assertEquals(workerAfter.deprecated_at !== null, true);

    // Clean up
    await worker.stop();
  })
);

Deno.test(
  'Flow worker deprecation - multiple flow workers for same flow',
  withTransaction(async (sql) => {
    const flowSlug = 'test_flow_multi_' + crypto.randomUUID().slice(0, 8);
    const queueName = flowSlug;
    
    // Track executions per worker
    const worker1Executions = { step1: 0, step2: 0 };
    const worker2Executions = { step1: 0, step2: 0 };
    
    const flow1 = createTestFlow(flowSlug, worker1Executions);
    const flow2 = createTestFlow(flowSlug, worker2Executions);
    
    // Create the flow structure in the database
    await sql`select pgflow.create_flow(${flowSlug}::text)`;
    await sql`select pgflow.add_step(${flowSlug}::text, 'step1'::text)`;
    await sql`select pgflow.add_step(${flowSlug}::text, 'step2'::text, ARRAY['step1']::text[], null, null, null, null)`;
    
    // Start two workers for the same flow
    const worker1 = startWorker(sql, flow1, {
      maxPollSeconds: 1,
      pollIntervalMs: 50,
    });

    const worker2 = startWorker(sql, flow2, {
      maxPollSeconds: 1,
      pollIntervalMs: 50,
    });

    await delay(300);

    // Verify both workers are running
    const workersBefore = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE queue_name = ${queueName}
      AND deprecated_at IS NULL
      ORDER BY worker_id
    `;
    assertEquals(workersBefore.length, 2, 'Both workers should be running');

    // Start several flow runs
    for (let i = 0; i < 4; i++) {
      await sql`select pgflow.start_flow(${flowSlug}::text, ${JSON.stringify({ value: i * 10 })}::jsonb)`;
    }
    
    // Wait for flows to be processed
    await delay(1500);
    
    // Verify both workers processed some flows
    const totalExecutionsBefore = worker1Executions.step1 + worker2Executions.step1;
    assertEquals(totalExecutionsBefore >= 4, true, 'All flows should be executed');
    assertEquals(worker1Executions.step1 > 0, true, 'Worker 1 should have processed some flows');
    assertEquals(worker2Executions.step1 > 0, true, 'Worker 2 should have processed some flows');
    
    console.log('Worker 1 executed:', worker1Executions);
    console.log('Worker 2 executed:', worker2Executions);

    // Deprecate all workers for this flow (simulating deployment)
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE queue_name = ${queueName}
        AND deprecated_at IS NULL
    `;

    // Wait for heartbeat detection
    console.log('Waiting for all workers to detect deprecation...');
    await delay(6000);

    // Start more flow runs after deprecation
    for (let i = 0; i < 4; i++) {
      await sql`select pgflow.start_flow(${flowSlug}::text, ${JSON.stringify({ value: 100 + i * 10 })}::jsonb)`;
    }
    
    // Wait to see if these get processed (they shouldn't)
    await delay(2000);
    
    // Verify no new executions by either worker
    const totalExecutionsAfter = worker1Executions.step1 + worker2Executions.step1;
    assertEquals(
      totalExecutionsAfter,
      totalExecutionsBefore,
      'No new executions should happen after deprecation'
    );

    // Check that new runs are still pending
    const pendingRuns = await sql`
      SELECT COUNT(*) as count FROM pgflow.runs 
      WHERE flow_slug = ${flowSlug}
      AND status = 'started'
      AND remaining_steps > 0
    `;
    assertEquals(Number(pendingRuns[0].count) >= 4, true, 'New runs should still be pending');

    // Verify all workers are marked as deprecated
    const workersAfter = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE queue_name = ${queueName}
      AND deprecated_at IS NOT NULL
      ORDER BY worker_id
    `;
    assertEquals(workersAfter.length, 2, 'Both workers should be deprecated');

    // Clean up
    await worker1.stop();
    await worker2.stop();
  })
);
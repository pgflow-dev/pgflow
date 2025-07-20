import { assertEquals } from '@std/assert';
import { withTransaction } from '../db.ts';
import { delay } from '@std/async';
import type { WorkerRow } from '../../src/core/types.ts';
import { Flow } from '@pgflow/dsl';
import { startWorker } from './_helpers.ts';

// Create a simple test flow
const createTestFlow = (flowName: string) => {
  return new Flow<{ value: number }>({ slug: flowName })
    .step({ slug: 'step1' }, async (input) => {
      // Simulate some work
      await delay(100);
      return { result: input.run.value * 2 };
    })
    .step(
      { slug: 'step2', dependsOn: ['step1'] },
      async (input) => {
        // Simulate some work
        await delay(100);
        return { final: input.step1.result + 10 };
      }
    );
};

Deno.test(
  'Flow worker deprecation - should stop polling when deprecated',
  withTransaction(async (sql) => {
    const flowName = `test_flow_deprecation_${crypto.randomUUID().slice(0, 8)}`;
    const flow = createTestFlow(flowName);
    const workerId = crypto.randomUUID();
    
    // Create the flow structure in the database
    await sql`select pgflow.create_flow(${flowName}::text)`;
    await sql`select pgflow.add_step(${flowName}::text, 'step1'::text)`;
    await sql`select pgflow.add_step(${flowName}::text, 'step2'::text, deps_slugs => ARRAY['step1']::text[])`;
    
    // Start the flow worker
    const worker = startWorker(sql, flow, {
      maxPollSeconds: 1,
      pollIntervalMs: 50,
    });

    // Get the actual worker ID that was generated
    const actualWorkerId = (worker as any).lifecycle.workerId;

    // Wait for worker to start
    await delay(200);
    
    // Verify worker is registered and not deprecated
    const [workerBefore] = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE worker_id = ${actualWorkerId}::uuid
    `;
    assertEquals(workerBefore.deprecated_at, null);
    assertEquals(workerBefore.queue_name, flowName);

    // Get the lifecycle to check state
    const lifecycle = (worker as any).lifecycle;
    assertEquals(lifecycle.isRunning, true);
    assertEquals(lifecycle.isDeprecated, false);

    // Mark the worker as deprecated
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE worker_id = ${actualWorkerId}::uuid
    `;

    // Wait for next heartbeat (default is 5 seconds)
    await delay(5500);

    // Check that worker detected deprecation
    assertEquals(lifecycle.isDeprecated, true);
    assertEquals(lifecycle.isRunning, false);

    // Verify worker record shows deprecation
    const [workerAfter] = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE worker_id = ${actualWorkerId}::uuid
    `;
    assertEquals(workerAfter.deprecated_at !== null, true);

    // Clean up
    await worker.stop();
  })
);

Deno.test(
  'Flow worker deprecation - multiple flow workers for same flow',
  withTransaction(async (sql) => {
    const flowName = `test_flow_multi_${crypto.randomUUID().slice(0, 8)}`;
    const flow = createTestFlow(flowName);
    
    // Create the flow structure in the database
    await sql`select pgflow.create_flow(${flowName}::text)`;
    await sql`select pgflow.add_step(${flowName}::text, 'step1'::text)`;
    await sql`select pgflow.add_step(${flowName}::text, 'step2'::text, deps_slugs => ARRAY['step1']::text[])`;
    
    // Start two workers for the same flow
    const worker1 = startWorker(sql, flow, {
      maxPollSeconds: 1,
      pollIntervalMs: 50,
    });

    const worker2 = startWorker(sql, flow, {
      maxPollSeconds: 1,
      pollIntervalMs: 50,
    });

    // Get the actual worker IDs
    const workerId1 = (worker1 as any).lifecycle.workerId;
    const workerId2 = (worker2 as any).lifecycle.workerId;

    await delay(200);

    // Verify both workers are running
    const workersBefore = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE queue_name = ${flowName}
      AND deprecated_at IS NULL
      ORDER BY worker_id
    `;
    assertEquals(workersBefore.length, 2);

    // Deprecate all workers for this flow (simulating deployment)
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE queue_name = ${flowName}
        AND deprecated_at IS NULL
    `;

    // Wait for heartbeat detection
    await delay(6000);

    // Check that both workers detected deprecation
    const lifecycle1 = (worker1 as any).lifecycle;
    const lifecycle2 = (worker2 as any).lifecycle;
    
    assertEquals(lifecycle1.isDeprecated, true);
    assertEquals(lifecycle2.isDeprecated, true);

    // Verify all workers are marked as deprecated
    const workersAfter = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE queue_name = ${flowName}
      AND deprecated_at IS NOT NULL
      ORDER BY worker_id
    `;
    assertEquals(workersAfter.length, 2);

    // Clean up
    await worker1.stop();
    await worker2.stop();
  })
);
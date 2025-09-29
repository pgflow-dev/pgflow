import { assertEquals, assertMatch } from '@std/assert';
import { Flow, compileFlow } from '@pgflow/dsl';
import { createControlPlaneHandler } from '../../../src/control-plane/server.ts';

// Test flows covering different DSL features
const FlowWithSingleStep = new Flow({ slug: 'flow_single_step' })
  .step({ slug: 'step1' }, () => ({ result: 'done' }));

const FlowWithRuntimeOptions = new Flow({
  slug: 'flow_with_options',
  maxAttempts: 5,
  timeout: 120,
  baseDelay: 2000,
}).step({ slug: 'step1' }, () => ({ result: 'ok' }));

const FlowWithMultipleSteps = new Flow({ slug: 'flow_multiple_steps' })
  .step({ slug: 'step1' }, () => ({ value: 1 }))
  .step({ slug: 'step2', dependsOn: ['step1'] }, () => ({ value: 2 }))
  .step({ slug: 'step3', dependsOn: ['step2'] }, () => ({ value: 3 }));

const FlowWithArrayStep = new Flow<{ items: string[] }>({
  slug: 'flow_with_array',
})
  .array({ slug: 'process_items' }, ({ run }) =>
    run.items.map((item) => ({ item, processed: true }))
  );

const FlowWithMapStep = new Flow<string[]>({ slug: 'flow_with_map' })
  .map({ slug: 'uppercase' }, (text) => text.toUpperCase())
  .step({ slug: 'join', dependsOn: ['uppercase'] }, (input) => ({
    result: input.uppercase.join(','),
  }));

const FlowWithStepOptions = new Flow({ slug: 'flow_step_options' })
  .step(
    { slug: 'step1', maxAttempts: 10, timeout: 60, baseDelay: 500 },
    () => ({ result: 'done' })
  );

const FlowWithParallelSteps = new Flow({ slug: 'flow_parallel' })
  .step({ slug: 'step1' }, () => ({ a: 1 }))
  .step({ slug: 'step2' }, () => ({ b: 2 }))
  .step({ slug: 'step3', dependsOn: ['step1', 'step2'] }, () => ({
    c: 3,
  }));

// All test flows
const ALL_TEST_FLOWS = [
  FlowWithSingleStep,
  FlowWithRuntimeOptions,
  FlowWithMultipleSteps,
  FlowWithArrayStep,
  FlowWithMapStep,
  FlowWithStepOptions,
  FlowWithParallelSteps,
];

Deno.test('ControlPlane - should reject duplicate flow slugs', () => {
  // createControlPlaneHandler validates flows, so we test that directly
  let error: Error | null = null;
  try {
    createControlPlaneHandler([FlowWithSingleStep, FlowWithSingleStep]);
  } catch (e) {
    error = e as Error;
  }

  assertEquals(error instanceof Error, true);
  assertMatch(error!.message, /Duplicate flow slug detected: 'flow_single_step'/);
});

Deno.test('ControlPlane Handler - GET /flows/:slug returns 404 for unknown flow', async () => {
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS);

  const request = new Request('http://localhost/pgflow/flows/unknown_flow');
  const response = handler(request);

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Flow Not Found');
  assertMatch(data.message, /Flow 'unknown_flow' not found/);
});

Deno.test('ControlPlane Handler - returns 404 for invalid routes', async () => {
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS);

  const request = new Request('http://localhost/pgflow/invalid/route');
  const response = handler(request);

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Not Found');
  assertMatch(data.message, /Route GET \/pgflow\/invalid\/route not found/);
});

Deno.test('ControlPlane Handler - returns 404 for wrong HTTP method', async () => {
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS);

  const request = new Request('http://localhost/pgflow/flows/flow_single_step', {
    method: 'POST',
  });
  const response = handler(request);

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Not Found');
  assertMatch(data.message, /Route POST \/pgflow\/flows\/flow_single_step not found/);
});

// Dynamically generate tests for each flow variation
ALL_TEST_FLOWS.forEach((flow) => {
  Deno.test(`ControlPlane Handler - compiles flow: ${flow.slug}`, async () => {
    const handler = createControlPlaneHandler(ALL_TEST_FLOWS);
    const expectedSql = compileFlow(flow);

    const request = new Request(`http://localhost/pgflow/flows/${flow.slug}`);
    const response = handler(request);

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.flowSlug, flow.slug);
    assertEquals(data.sql, expectedSql);
  });
});

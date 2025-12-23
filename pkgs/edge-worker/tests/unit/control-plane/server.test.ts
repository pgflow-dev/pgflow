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
  .array({ slug: 'process_items' }, (flowInput) =>
    flowInput.items.map((item) => ({ item, processed: true }))
  );

const FlowWithMapStep = new Flow<string[]>({ slug: 'flow_with_map' })
  .map({ slug: 'uppercase' }, (text) => text.toUpperCase())
  .step({ slug: 'join', dependsOn: ['uppercase'] }, (deps) => ({
    result: deps.uppercase.join(','),
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
  const response = await handler(request);

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Flow Not Found');
  assertMatch(data.message, /Flow 'unknown_flow' not found/);
});

Deno.test('ControlPlane Handler - returns 404 for invalid routes', async () => {
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS);

  const request = new Request('http://localhost/pgflow/invalid/route');
  const response = await handler(request);

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
  const response = await handler(request);

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
    const response = await handler(request);

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.flowSlug, flow.slug);
    assertEquals(data.sql, expectedSql);
  });
});

Deno.test('ControlPlane Handler - GET /flows/:slug returns 500 on compilation error', async () => {
  // Create a flow with mismatched stepOrder (references non-existent step)
  const brokenFlow = new Flow({ slug: 'broken_flow' }).step(
    { slug: 'step1' },
    () => ({})
  );

  // Tamper with stepOrder to reference non-existent step
  // This will cause compileFlow to throw when it tries to get the step definition
  // deno-lint-ignore no-explicit-any
  (brokenFlow as any).stepOrder.push('nonexistent_step');

  const handler = createControlPlaneHandler([brokenFlow]);
  const request = new Request('http://localhost/pgflow/flows/broken_flow');
  const response = await handler(request);

  assertEquals(response.status, 500);
  const data = await response.json();
  assertEquals(data.error, 'Compilation Error');
  assertMatch(data.message, /does not exist in flow/);
});

// Tests for object input support (namespace imports)
Deno.test('ControlPlane Handler - accepts object of flows', async () => {
  const flowsObject = {
    FlowWithSingleStep,
    FlowWithRuntimeOptions,
  };

  const handler = createControlPlaneHandler(flowsObject);
  const expectedSql = compileFlow(FlowWithSingleStep);

  const request = new Request('http://localhost/pgflow/flows/flow_single_step');
  const response = await handler(request);

  assertEquals(response.status, 200);
  const data = await response.json();
  assertEquals(data.flowSlug, 'flow_single_step');
  assertEquals(data.sql, expectedSql);
});

Deno.test('ControlPlane Handler - accepts namespace import style object', async () => {
  // Simulates: import * as flows from './flows/index.ts'
  const flowsNamespace = {
    FlowWithSingleStep,
    FlowWithMultipleSteps,
    FlowWithParallelSteps,
  };

  const handler = createControlPlaneHandler(flowsNamespace);

  // All flows should be accessible
  for (const flow of [FlowWithSingleStep, FlowWithMultipleSteps, FlowWithParallelSteps]) {
    const request = new Request(`http://localhost/pgflow/flows/${flow.slug}`);
    const response = await handler(request);
    assertEquals(response.status, 200);
  }
});

Deno.test('ControlPlane Handler - object input rejects duplicate flow slugs', () => {
  // Create two different flow objects with the same slug
  const Flow1 = new Flow({ slug: 'duplicate_slug' }).step({ slug: 's1' }, () => ({}));
  const Flow2 = new Flow({ slug: 'duplicate_slug' }).step({ slug: 's2' }, () => ({}));

  let error: Error | null = null;
  try {
    createControlPlaneHandler({ Flow1, Flow2 });
  } catch (e) {
    error = e as Error;
  }

  assertEquals(error instanceof Error, true);
  assertMatch(error!.message, /Duplicate flow slug detected: 'duplicate_slug'/);
});

Deno.test('ControlPlane Handler - object input returns 404 for unknown flow', async () => {
  const handler = createControlPlaneHandler({ FlowWithSingleStep });

  const request = new Request('http://localhost/pgflow/flows/unknown_flow');
  const response = await handler(request);

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Flow Not Found');
});

Deno.test('ControlPlane Handler - empty object creates handler with no flows', async () => {
  const handler = createControlPlaneHandler({});

  const request = new Request('http://localhost/pgflow/flows/any_flow');
  const response = await handler(request);

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Flow Not Found');
});

Deno.test('ControlPlane Handler - empty array creates handler with no flows', async () => {
  const handler = createControlPlaneHandler([]);

  const request = new Request('http://localhost/pgflow/flows/any_flow');
  const response = await handler(request);

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Flow Not Found');
});

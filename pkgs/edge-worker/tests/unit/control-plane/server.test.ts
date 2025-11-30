import { assertEquals, assertMatch } from '@std/assert';
import { Flow, compileFlow, extractFlowShape } from '@pgflow/dsl';
import type { FlowShape } from '@pgflow/dsl';
import {
  createControlPlaneHandler,
  type ControlPlaneOptions,
} from '../../../src/control-plane/server.ts';

// Mock SQL function that simulates database responses
function createMockSql(response: {
  status: 'compiled' | 'verified' | 'recompiled' | 'mismatch';
  differences: string[];
}) {
  return function mockSql(
    _strings: TemplateStringsArray,
    ..._values: unknown[]
  ) {
    // Return array with result object matching SQL query pattern
    return Promise.resolve([{ result: response }]);
  };
}

// Mock SQL that throws an error
function createErrorSql(errorMessage: string) {
  return function mockSql() {
    return Promise.reject(new Error(errorMessage));
  };
}

// Helper to create POST request with body
function createEnsureCompiledRequest(
  slug: string,
  body: { shape: FlowShape; mode: 'development' | 'production' },
  apikey?: string
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apikey) {
    headers['apikey'] = apikey;
  }
  return new Request(`http://localhost/pgflow/flows/${slug}/ensure-compiled`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

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

// ============================================================
// Tests for POST /flows/:slug/ensure-compiled endpoint
// ============================================================

const TEST_SECRET_KEY = 'test-secret-key-12345';

Deno.test('ensure-compiled - returns 401 without apikey header', async () => {
  const mockSql = createMockSql({ status: 'verified', differences: [] });
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const shape = extractFlowShape(FlowWithSingleStep);
  const request = createEnsureCompiledRequest(
    'flow_single_step',
    { shape, mode: 'production' }
    // No apikey
  );
  const response = await handler(request);

  assertEquals(response.status, 401);
  const data = await response.json();
  assertEquals(data.error, 'Unauthorized');
});

Deno.test('ensure-compiled - returns 401 with wrong apikey', async () => {
  const mockSql = createMockSql({ status: 'verified', differences: [] });
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const shape = extractFlowShape(FlowWithSingleStep);
  const request = createEnsureCompiledRequest(
    'flow_single_step',
    { shape, mode: 'production' },
    'wrong-api-key'
  );
  const response = await handler(request);

  assertEquals(response.status, 401);
  const data = await response.json();
  assertEquals(data.error, 'Unauthorized');
});

Deno.test('ensure-compiled - returns 200 with status compiled for new flow', async () => {
  const mockSql = createMockSql({ status: 'compiled', differences: [] });
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const shape = extractFlowShape(FlowWithSingleStep);
  const request = createEnsureCompiledRequest(
    'flow_single_step',
    { shape, mode: 'production' },
    TEST_SECRET_KEY
  );
  const response = await handler(request);

  assertEquals(response.status, 200);
  const data = await response.json();
  assertEquals(data.status, 'compiled');
  assertEquals(data.differences, []);
});

Deno.test('ensure-compiled - returns 200 with status verified for matching shape', async () => {
  const mockSql = createMockSql({ status: 'verified', differences: [] });
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const shape = extractFlowShape(FlowWithSingleStep);
  const request = createEnsureCompiledRequest(
    'flow_single_step',
    { shape, mode: 'production' },
    TEST_SECRET_KEY
  );
  const response = await handler(request);

  assertEquals(response.status, 200);
  const data = await response.json();
  assertEquals(data.status, 'verified');
});

Deno.test('ensure-compiled - returns 200 with status recompiled in development mode', async () => {
  const mockSql = createMockSql({
    status: 'recompiled',
    differences: ['Step count differs: 1 vs 2'],
  });
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const shape = extractFlowShape(FlowWithSingleStep);
  const request = createEnsureCompiledRequest(
    'flow_single_step',
    { shape, mode: 'development' },
    TEST_SECRET_KEY
  );
  const response = await handler(request);

  assertEquals(response.status, 200);
  const data = await response.json();
  assertEquals(data.status, 'recompiled');
  assertEquals(data.differences, ['Step count differs: 1 vs 2']);
});

Deno.test('ensure-compiled - returns 409 on shape mismatch in production mode', async () => {
  const mockSql = createMockSql({
    status: 'mismatch',
    differences: ['Step count differs: 1 vs 2'],
  });
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const shape = extractFlowShape(FlowWithSingleStep);
  const request = createEnsureCompiledRequest(
    'flow_single_step',
    { shape, mode: 'production' },
    TEST_SECRET_KEY
  );
  const response = await handler(request);

  assertEquals(response.status, 409);
  const data = await response.json();
  assertEquals(data.status, 'mismatch');
  assertEquals(data.differences, ['Step count differs: 1 vs 2']);
});

Deno.test('ensure-compiled - returns 500 on database error', async () => {
  const mockSql = createErrorSql('Connection failed');
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const shape = extractFlowShape(FlowWithSingleStep);
  const request = createEnsureCompiledRequest(
    'flow_single_step',
    { shape, mode: 'production' },
    TEST_SECRET_KEY
  );
  const response = await handler(request);

  assertEquals(response.status, 500);
  const data = await response.json();
  assertEquals(data.error, 'Database Error');
  assertMatch(data.message, /Connection failed/);
});

Deno.test('ensure-compiled - returns 404 when SQL not configured', async () => {
  // No sql option provided
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS);

  const shape = extractFlowShape(FlowWithSingleStep);
  const request = createEnsureCompiledRequest(
    'flow_single_step',
    { shape, mode: 'production' },
    TEST_SECRET_KEY
  );
  const response = await handler(request);

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Not Found');
});

Deno.test('ensure-compiled - returns 400 for invalid JSON body', async () => {
  const mockSql = createMockSql({ status: 'verified', differences: [] });
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const request = new Request(
    'http://localhost/pgflow/flows/flow_single_step/ensure-compiled',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: TEST_SECRET_KEY,
      },
      body: 'invalid json',
    }
  );
  const response = await handler(request);

  assertEquals(response.status, 400);
  const data = await response.json();
  assertEquals(data.error, 'Bad Request');
});

Deno.test('ensure-compiled - returns 400 for missing shape in body', async () => {
  const mockSql = createMockSql({ status: 'verified', differences: [] });
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const request = new Request(
    'http://localhost/pgflow/flows/flow_single_step/ensure-compiled',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: TEST_SECRET_KEY,
      },
      body: JSON.stringify({ mode: 'production' }), // missing shape
    }
  );
  const response = await handler(request);

  assertEquals(response.status, 400);
  const data = await response.json();
  assertEquals(data.error, 'Bad Request');
  assertMatch(data.message, /shape/);
});

Deno.test('ensure-compiled - returns 400 for invalid mode', async () => {
  const mockSql = createMockSql({ status: 'verified', differences: [] });
  const options: ControlPlaneOptions = {
    sql: mockSql,
    secretKey: TEST_SECRET_KEY,
  };
  const handler = createControlPlaneHandler(ALL_TEST_FLOWS, options);

  const shape = extractFlowShape(FlowWithSingleStep);
  const request = new Request(
    'http://localhost/pgflow/flows/flow_single_step/ensure-compiled',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: TEST_SECRET_KEY,
      },
      body: JSON.stringify({ shape, mode: 'invalid' }),
    }
  );
  const response = await handler(request);

  assertEquals(response.status, 400);
  const data = await response.json();
  assertEquals(data.error, 'Bad Request');
  assertMatch(data.message, /mode/);
});

import { assertEquals, assertExists } from '@std/assert';
import { e2eConfig } from '../config.ts';
import { log } from './_helpers.ts';

const API_URL = e2eConfig.apiUrl;
const BASE_URL = `${API_URL}/functions/v1/pgflow`;

/**
 * Helper to ensure the pgflow function is responsive
 * Makes initial request and retries until server is ready
 */
async function ensureServerReady() {
  log('Ensuring pgflow function is ready...');

  const maxRetries = e2eConfig.serverReadyMaxRetries;
  const retryDelayMs = e2eConfig.serverReadyRetryDelayMs;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to hit the /flows/:slug endpoint to wake up the function
      const response = await fetch(`${BASE_URL}/flows/test_flow_1`, {
        signal: AbortSignal.timeout(5000),
      });

      // 502/503 means edge function is still initializing - retry
      if (response.status === 502 || response.status === 503) {
        await response.body?.cancel();
        log(
          `Retry ${i + 1}/${maxRetries}: Server returned ${response.status}, waiting...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }

      // Any other response (2xx, 4xx, etc.) means the function is running properly
      if (response.status > 0) {
        // Consume the response body to avoid resource leaks
        await response.body?.cancel();
        log('pgflow function is ready!');
        return;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`Server not ready after ${maxRetries} retries: ${error}`);
      }
      log(`Retry ${i + 1}/${maxRetries}: Server not ready yet, waiting...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(`Server not ready after ${maxRetries} retries`);
}

Deno.test('E2E ControlPlane - GET /flows/:slug returns compiled SQL', async () => {
  await ensureServerReady();

  const response = await fetch(`${BASE_URL}/flows/test_flow_1`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.flowSlug, 'test_flow_1');
  assertExists(data.sql);
  assertEquals(Array.isArray(data.sql), true);
  assertEquals(data.sql.length > 0, true);

  log(`Successfully compiled flow test_flow_1 (${data.sql.length} SQL statements)`);
});

Deno.test('E2E ControlPlane - GET /flows/:slug returns 404 for unknown flow', async () => {
  const response = await fetch(`${BASE_URL}/flows/unknown_flow`);
  const data = await response.json();

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Flow Not Found');
  assertExists(data.message);

  log('404 error correctly returned for unknown flow');
});

Deno.test('E2E ControlPlane - GET /invalid/route returns 404', async () => {
  const response = await fetch(`${BASE_URL}/invalid/route`);
  const data = await response.json();

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Not Found');
  assertExists(data.message);

  log('404 error correctly returned for invalid route');
});

Deno.test('E2E ControlPlane - POST /flows/:slug returns 404 (wrong method)', async () => {
  const response = await fetch(`${BASE_URL}/flows/test_flow_1`, {
    method: 'POST',
  });
  const data = await response.json();

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Not Found');
  assertExists(data.message);

  log('404 error correctly returned for wrong HTTP method');
});

Deno.test('E2E ControlPlane - GET /flows/test_flow_2 returns compiled SQL with dependencies', async () => {
  const response = await fetch(`${BASE_URL}/flows/test_flow_2`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.flowSlug, 'test_flow_2');
  assertExists(data.sql);
  assertEquals(Array.isArray(data.sql), true);

  // Verify SQL contains both steps and dependency information
  const sqlContent = data.sql.join('\n');
  assertEquals(sqlContent.includes('step1'), true);
  assertEquals(sqlContent.includes('step2'), true);
  // step2 depends on step1, passed as ARRAY['step1'] in add_step call
  assertEquals(sqlContent.includes("ARRAY['step1']"), true);

  log(`Successfully compiled flow test_flow_2 with dependencies (${data.sql.length} SQL statements)`);
});

Deno.test('E2E ControlPlane - GET /flows/test_flow_3 returns compiled SQL with maxAttempts', async () => {
  const response = await fetch(`${BASE_URL}/flows/test_flow_3`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.flowSlug, 'test_flow_3');
  assertExists(data.sql);
  assertEquals(Array.isArray(data.sql), true);

  // Verify SQL contains maxAttempts configuration (5 as set in the flow)
  const sqlContent = data.sql.join('\n');
  assertEquals(sqlContent.includes('max_attempts'), true);
  assertEquals(sqlContent.includes('5'), true);

  log(`Successfully compiled flow test_flow_3 with maxAttempts (${data.sql.length} SQL statements)`);
});

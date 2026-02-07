import { assertEquals, assertExists } from '@std/assert';
import { e2eConfig } from '../config.ts';
import { log } from './_helpers.ts';
import postgres from 'postgres';

const API_URL = e2eConfig.apiUrl;
// Use secrets_test function which has mocked production-style SUPABASE_URL
const BASE_URL = `${API_URL}/functions/v1/secrets_test`;
const SECRET_NAMES = ['supabase_project_id', 'supabase_service_role_key'];

// Expected values from secrets_test edge function (must match index.ts)
const EXPECTED_PROJECT_ID = 'test-secrets-project';
const EXPECTED_SERVICE_ROLE_KEY = 'test-production-service-role-key-for-secrets';

// Auth header required for production-mode endpoints
const AUTH_HEADERS = {
  Authorization: `Bearer ${EXPECTED_SERVICE_ROLE_KEY}`,
};

function createSql() {
  return postgres(e2eConfig.dbUrl, { prepare: false });
}

async function cleanupSecrets(sql: postgres.Sql) {
  await sql`DELETE FROM vault.secrets WHERE name = ANY(${SECRET_NAMES})`;
}

/**
 * Helper to ensure the secrets_test function is responsive
 * Makes initial request and retries until server is ready
 */
async function ensureServerReady() {
  log('Ensuring secrets_test function is ready...');

  const maxRetries = e2eConfig.serverReadyMaxRetries;
  const retryDelayMs = e2eConfig.serverReadyRetryDelayMs;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to hit the /secrets/configure endpoint to wake up the function
      const response = await fetch(`${BASE_URL}/secrets/configure`, {
        method: 'POST',
        headers: AUTH_HEADERS,
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
        log('secrets_test function is ready!');
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

Deno.test('E2E ControlPlane - POST /secrets/configure creates secrets when none exist', async () => {
  await ensureServerReady();

  const sql = createSql();
  try {
    // Clean slate - ensure no secrets exist
    await cleanupSecrets(sql);

    // Configure
    const response = await fetch(`${BASE_URL}/secrets/configure`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    const data = await response.json();

    assertEquals(response.status, 200);
    assertEquals(data.success, true);
    assertExists(data.configured);
    assertEquals(data.configured.includes('supabase_project_id'), true);
    assertEquals(data.configured.includes('supabase_service_role_key'), true);

    // Verify secrets were created with expected values
    const [projectId] = await sql`
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'supabase_project_id'
    `;
    assertEquals(projectId.decrypted_secret, EXPECTED_PROJECT_ID);

    const [serviceRoleKey] = await sql`
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'supabase_service_role_key'
    `;
    assertEquals(serviceRoleKey.decrypted_secret, EXPECTED_SERVICE_ROLE_KEY);

    log('Successfully configured secrets with expected values');
  } finally {
    await cleanupSecrets(sql);
    await sql.end();
  }
});

Deno.test('E2E ControlPlane - POST /secrets/configure is idempotent', async () => {
  const sql = createSql();
  try {
    // Clean slate
    await cleanupSecrets(sql);

    // First call - creates secrets
    const response1 = await fetch(`${BASE_URL}/secrets/configure`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    await response1.json(); // Consume body to avoid leak
    assertEquals(response1.status, 200);

    // Second call - should succeed without error (idempotent)
    const response2 = await fetch(`${BASE_URL}/secrets/configure`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    const data2 = await response2.json();

    assertEquals(response2.status, 200);
    assertEquals(data2.success, true);

    // Still only 2 secrets (not duplicated)
    const secrets = await sql`
      SELECT name FROM vault.decrypted_secrets
      WHERE name = ANY(${SECRET_NAMES})
    `;
    assertEquals(secrets.length, 2);

    log('Secrets configure is idempotent');
  } finally {
    await cleanupSecrets(sql);
    await sql.end();
  }
});

Deno.test('E2E ControlPlane - GET /secrets/configure returns 404 (wrong method)', async () => {
  const response = await fetch(`${BASE_URL}/secrets/configure`);
  const data = await response.json();

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Not Found');

  log('404 error correctly returned for wrong HTTP method');
});

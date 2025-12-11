import { assertEquals } from '@std/assert';
import postgres from 'postgres';

/**
 * Creates a postgres connection to Supabase DB (has vault extension with pgsodium key)
 * Uses SUPABASE_DB_URL or DB_URL env var if available
 */
function createSql() {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL') ||
    Deno.env.get('DB_URL') ||
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  return postgres(dbUrl, {
    prepare: false,
  });
}

/**
 * Test wrapper that cleans up secrets before/after each test
 */
function withCleanSecrets(callback: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = createSql();

  return async () => {
    try {
      // Clean up any existing test secrets
      await sql`DELETE FROM vault.secrets WHERE name IN ('supabase_project_id', 'supabase_service_role_key')`;

      await callback(sql);
    } finally {
      // Clean up after test
      await sql`DELETE FROM vault.secrets WHERE name IN ('supabase_project_id', 'supabase_service_role_key')`;
      await sql.end();
    }
  };
}

Deno.test(
  'vault.create_secret creates a secret',
  withCleanSecrets(async (sql) => {
    await sql`SELECT vault.create_secret('test-project-id', 'supabase_project_id')`;

    const [secret] = await sql`
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'supabase_project_id'
    `;

    assertEquals(secret.decrypted_secret, 'test-project-id');
  })
);

Deno.test(
  'delete + create pattern works for upsert',
  withCleanSecrets(async (sql) => {
    // Create initial secret
    await sql`SELECT vault.create_secret('old-value', 'supabase_project_id')`;

    // Upsert with new value
    await sql.begin(async (tx) => {
      await tx`DELETE FROM vault.secrets WHERE name = 'supabase_project_id'`;
      await tx`SELECT vault.create_secret('new-value', 'supabase_project_id')`;
    });

    const [secret] = await sql`
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'supabase_project_id'
    `;

    assertEquals(secret.decrypted_secret, 'new-value');
  })
);

Deno.test(
  'transaction rolls back on error',
  withCleanSecrets(async (sql) => {
    // Create initial secret
    await sql`SELECT vault.create_secret('original', 'supabase_project_id')`;

    // Try to upsert but fail in middle of transaction
    try {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM vault.secrets WHERE name = 'supabase_project_id'`;
        // This will fail - can't create duplicate
        await tx`SELECT vault.create_secret('new', 'supabase_project_id')`;
        await tx`SELECT vault.create_secret('new', 'supabase_project_id')`; // duplicate!
      });
    } catch {
      // Expected to fail
    }

    // Original should still exist (transaction rolled back)
    const [secret] = await sql`
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'supabase_project_id'
    `;

    assertEquals(secret.decrypted_secret, 'original');
  })
);

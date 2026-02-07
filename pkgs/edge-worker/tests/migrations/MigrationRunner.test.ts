import { assertEquals } from '@std/assert';
import postgres from 'postgres';
import { cleanDbConfig } from '../config.ts';
import { MigrationRunner } from '../../src/control-plane/migrations/MigrationRunner.ts';
import { getMigrations } from '../../src/control-plane/migrations/loader.ts';

/**
 * Creates a postgres connection for the clean database.
 * Each test gets a fresh connection.
 */
function createCleanDbSql() {
  return postgres(cleanDbConfig.dbUrl, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

/**
 * Test wrapper that ensures schemas are cleaned up before each test.
 * We can't use transactions here because migrations create schemas
 * and we need to verify their creation.
 */
function withCleanDb(callback: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = createCleanDbSql();

  return async () => {
    try {
      // Clean up any existing schemas before test
      await sql`DROP SCHEMA IF EXISTS pgflow_installer CASCADE`;
      await sql`DROP SCHEMA IF EXISTS pgflow CASCADE`;
      await sql`DROP SCHEMA IF EXISTS pgmq CASCADE`;

      await callback(sql);
    } finally {
      // Clean up after test
      await sql`DROP SCHEMA IF EXISTS pgflow_installer CASCADE`;
      await sql`DROP SCHEMA IF EXISTS pgflow CASCADE`;
      await sql`DROP SCHEMA IF EXISTS pgmq CASCADE`;
      await sql.end();
    }
  };
}

Deno.test(
  'list() returns all migrations as pending on clean DB',
  withCleanDb(async (sql) => {
    const migrations = await getMigrations();
    const runner = new MigrationRunner(sql);
    const result = await runner.list();

    assertEquals(result.length, migrations.length);
    assertEquals(
      result.every((m) => m.status === 'pending'),
      true,
      'All migrations should be pending'
    );
  })
);

Deno.test(
  'up() applies all migrations on clean DB',
  withCleanDb(async (sql) => {
    const migrations = await getMigrations();
    const runner = new MigrationRunner(sql);
    const result = await runner.up();

    assertEquals(result.success, true, `Migration failed: ${result.error}`);
    assertEquals(result.applied, migrations.length);
    assertEquals(result.skipped, 0);
  })
);

Deno.test(
  'up() is idempotent - second call skips all',
  withCleanDb(async (sql) => {
    const migrations = await getMigrations();
    const runner = new MigrationRunner(sql);

    // First call applies all
    await runner.up();

    // Second call should skip all
    const result = await runner.up();

    assertEquals(result.success, true);
    assertEquals(result.applied, 0);
    assertEquals(result.skipped, migrations.length);
  })
);

Deno.test(
  'list() shows applied after up()',
  withCleanDb(async (sql) => {
    const runner = new MigrationRunner(sql);

    await runner.up();
    const result = await runner.list();

    assertEquals(
      result.every((m) => m.status === 'applied'),
      true,
      'All migrations should be applied'
    );
  })
);

Deno.test(
  'list() returns migrations sorted by timestamp',
  withCleanDb(async (sql) => {
    const runner = new MigrationRunner(sql);
    const result = await runner.list();

    const timestamps = result.map((m) => m.timestamp);
    const sorted = [...timestamps].sort();

    assertEquals(timestamps, sorted, 'Migrations should be sorted by timestamp');
  })
);

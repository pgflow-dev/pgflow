import { describe, it, expect } from 'vitest';
import { withTransaction } from '../helpers/db.js';
import { createTestSupabaseClient } from '../helpers/setup.js';
import { createTestFlow } from '../helpers/fixtures.js';

describe('Supabase Setup Integration', () => {
  it(
    'should connect to test database',
    withTransaction(async (sql) => {
      const result = await sql`SELECT 1 as test`;
      expect(result[0].test).toBe(1);
    })
  );

  it(
    'should have pgflow schema installed',
    withTransaction(async (sql) => {
      const result = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'pgflow'
      ) as schema_exists
    `;
      expect(result[0].schema_exists).toBe(true);
    })
  );

  it(
    'should have pgflow tables',
    withTransaction(async (sql) => {
      const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'pgflow'
      ORDER BY table_name
    `;

      const tableNames = tables.map((t) => t.table_name);
      expect(tableNames).toContain('flows');
      expect(tableNames).toContain('steps');
      expect(tableNames).toContain('runs');
      expect(tableNames).toContain('step_states');
      expect(tableNames).toContain('step_tasks');
    })
  );

  it(
    'should create and retrieve a test flow',
    withTransaction(async (sql) => {
      const testFlow = createTestFlow('setup_test_flow');

      // Create flow using pgflow function with default parameters
      await sql`
      SELECT pgflow.create_flow(${testFlow.slug})
    `;

      // Verify flow was created
      const flows = await sql`
      SELECT * FROM pgflow.flows WHERE flow_slug = ${testFlow.slug}
    `;

      expect(flows).toHaveLength(1);
      expect(flows[0].flow_slug).toBe(testFlow.slug);
    })
  );

  it('should handle realtime connections', async () => {
    const client = createTestSupabaseClient();

    // Test that realtime is available
    const channel = client.channel('test-channel');
    expect(channel).toBeDefined();

    // Clean up
    await client.removeAllChannels();
  });
});

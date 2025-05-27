import type { Sql } from 'postgres';

/**
 * Grants necessary permissions for integration tests to access pgflow schema through PostgREST.
 * These permissions should eventually be moved to the core migrations in production.
 */
export async function grantTestPermissions(sql: Sql): Promise<void> {
  await sql`GRANT USAGE ON SCHEMA pgflow TO service_role`;
  // Grant only the specific functions needed for the API
  await sql`GRANT EXECUTE ON FUNCTION pgflow.start_flow_with_states(text, jsonb, uuid) TO service_role`;
  await sql`GRANT EXECUTE ON FUNCTION pgflow.get_run_with_states(uuid) TO service_role`;
}
import type { Sql } from 'postgres';

/**
 * Grants necessary permissions for integration tests to access pgflow schema through PostgREST.
 * These permissions should eventually be moved to the core migrations in production.
 */
export async function grantTestPermissions(sql: Sql): Promise<void> {
  await sql`GRANT USAGE ON SCHEMA pgflow TO anon, authenticated, service_role`;
  await sql`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgflow TO anon, authenticated, service_role`;
  await sql`GRANT SELECT ON TABLE pgflow.flows, pgflow.steps TO anon, authenticated, service_role`;
}
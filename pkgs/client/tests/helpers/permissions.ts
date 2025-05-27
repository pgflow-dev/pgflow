import type { Sql } from 'postgres';

/**
 * Grants minimal permissions required for PgflowClient to work with Supabase REST API.
 * This allows the anon role to access pgflow schema functions and tables through PostgREST.
 * Also ensures realtime partitions exist for broadcast functionality.
 * Handles concurrent execution and already-granted permissions gracefully.
 */
export async function grantMinimalPgflowPermissions(sql: Sql) {
  // Clean up any leftover data from previous tests
  await sql`SELECT pgflow_tests.reset_db()`;
  
  // Ensure realtime partition exists (required after db reset)
  await sql`SELECT pgflow_tests.create_realtime_partition()`;

  // Grant minimal permissions to service_role (used by tests) - ignore if already granted
  try { await sql`GRANT USAGE ON SCHEMA pgflow TO service_role`; } catch {}
  try { await sql`GRANT EXECUTE ON FUNCTION pgflow.start_flow_with_states(text, jsonb, uuid) TO service_role`; } catch {}
  try { await sql`GRANT EXECUTE ON FUNCTION pgflow.get_run_with_states(uuid) TO service_role`; } catch {}
  try { await sql`GRANT SELECT ON TABLE pgflow.flows TO service_role`; } catch {}
  try { await sql`GRANT SELECT ON TABLE pgflow.steps TO service_role`; } catch {}
}
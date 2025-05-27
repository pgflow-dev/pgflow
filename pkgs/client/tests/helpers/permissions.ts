import type { Sql } from 'postgres';

/**
 * Grants minimal permissions required for PgflowClient to work with Supabase REST API.
 * This allows the anon role to access pgflow schema functions and tables through PostgREST.
 * Also ensures realtime partitions exist for broadcast functionality.
 * Handles concurrent execution and already-granted permissions gracefully.
 */
export async function grantMinimalPgflowPermissions(sql: Sql) {
  // Ensure realtime partition exists (required after db reset)
  await sql`SELECT pgflow_tests.create_realtime_partition()`;
  // Ensure the required functions have SECURITY DEFINER and proper permissions
  try {
    await sql`
      CREATE OR REPLACE FUNCTION pgflow.start_flow_with_states(
        flow_slug TEXT,
        input JSONB,
        run_id UUID default null
      ) RETURNS JSONB AS $$
      DECLARE
        v_run_id UUID;
      BEGIN
        SELECT r.run_id INTO v_run_id FROM pgflow.start_flow(
          start_flow_with_states.flow_slug,
          start_flow_with_states.input,
          start_flow_with_states.run_id
        ) AS r LIMIT 1;
        RETURN pgflow.get_run_with_states(v_run_id);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;
  } catch (error: any) {
    if (error.code !== 'XX000') throw error; // Ignore concurrent updates
  }

  try {
    await sql`
      CREATE OR REPLACE FUNCTION pgflow.get_run_with_states(
        run_id UUID
      ) RETURNS JSONB AS $$
        SELECT jsonb_build_object(
          'run', to_jsonb(r),
          'steps', COALESCE(jsonb_agg(to_jsonb(s)) FILTER (WHERE s.run_id IS NOT NULL), '[]'::jsonb)
        )
        FROM pgflow.runs r
        LEFT JOIN pgflow.step_states s ON s.run_id = r.run_id
        WHERE r.run_id = get_run_with_states.run_id
        GROUP BY r.run_id;
      $$ LANGUAGE sql SECURITY DEFINER;
    `;
  } catch (error: any) {
    if (error.code !== 'XX000') throw error; // Ignore concurrent updates
  }

  // Grant minimal permissions to service_role (used by tests) - ignore if already granted
  try { await sql`GRANT USAGE ON SCHEMA pgflow TO service_role`; } catch {}
  try { await sql`GRANT EXECUTE ON FUNCTION pgflow.start_flow_with_states(text, jsonb, uuid) TO service_role`; } catch {}
  try { await sql`GRANT EXECUTE ON FUNCTION pgflow.get_run_with_states(uuid) TO service_role`; } catch {}
  try { await sql`GRANT SELECT ON TABLE pgflow.flows TO service_role`; } catch {}
  try { await sql`GRANT SELECT ON TABLE pgflow.steps TO service_role`; } catch {}
}
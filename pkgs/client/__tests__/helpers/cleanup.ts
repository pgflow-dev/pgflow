import type postgres from 'postgres';

/**
 * Cleans up all data for a specific flow, including:
 * - Queue messages
 * - Runtime data (runs, step_tasks, step_states)
 * 
 * Safe for parallel test execution since it only touches flow-specific data.
 */
export async function cleanupFlow(
  sql: postgres.Sql,
  flowSlug: string
): Promise<void> {
  // First, check if the queue exists and purge it
  // The queue name is the same as the flow slug
  try {
    await sql`SELECT pgmq.purge_queue(${flowSlug})`;
  } catch (error: any) {
    // Ignore error if queue doesn't exist (42P01 = undefined_table)
    if (error.code !== '42P01') {
      throw error;
    }
  }
  
  // Then delete runtime data in the correct order to respect foreign keys
  // 1. Delete step_tasks first (has FK to step_states)
  await sql`
    DELETE FROM pgflow.step_tasks
    WHERE run_id IN (
      SELECT run_id FROM pgflow.runs WHERE flow_slug = ${flowSlug}
    )
  `;
  
  // 2. Delete step_states (has FK to runs)
  await sql`
    DELETE FROM pgflow.step_states
    WHERE run_id IN (
      SELECT run_id FROM pgflow.runs WHERE flow_slug = ${flowSlug}
    )
  `;
  
  // 3. Delete runs
  await sql`
    DELETE FROM pgflow.runs
    WHERE flow_slug = ${flowSlug}
  `;
  
  // Note: We don't delete flow definitions (flows, steps, deps) 
  // as they are static and can be reused across test runs
}

/**
 * Purges only the queue for a specific flow.
 * Useful when you just need to clear messages but keep runtime data.
 */
export async function purgeQueue(
  sql: postgres.Sql,
  flowSlug: string
): Promise<void> {
  try {
    await sql`SELECT pgmq.purge_queue(${flowSlug})`;
  } catch (error: any) {
    // Ignore error if queue doesn't exist (42P01 = undefined_table)
    if (error.code !== '42P01') {
      throw error;
    }
  }
}
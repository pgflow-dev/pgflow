import type postgres from 'postgres';

/**
 * Skip a step using the internal _cascade_force_skip_steps function.
 * This is a test helper that wraps the internal function.
 * If pgflow.skip_step() is exposed publicly later, swap implementation here.
 */
export async function skipStep(
  sql: postgres.Sql,
  runId: string,
  stepSlug: string,
  skipReason: 'condition_unmet' | 'handler_failed' | 'dependency_skipped'
): Promise<void> {
  await sql`SELECT pgflow._cascade_force_skip_steps(
    ${runId}::uuid,
    ${stepSlug}::text,
    ${skipReason}::text
  )`;
}

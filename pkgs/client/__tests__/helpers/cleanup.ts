import postgres from 'postgres';

export async function cleanupTestData(sql: postgres.Sql) {
  // Clean up test data in reverse dependency order
  await sql`DELETE FROM pgflow.step_tasks WHERE flow_slug LIKE 'test_flow_%'`;
  await sql`DELETE FROM pgflow.step_states WHERE flow_slug LIKE 'test_flow_%'`;
  await sql`DELETE FROM pgflow.runs WHERE flow_slug LIKE 'test_flow_%'`;
  await sql`DELETE FROM pgflow.steps WHERE flow_slug LIKE 'test_flow_%'`;
  await sql`DELETE FROM pgflow.flows WHERE slug LIKE 'test_flow_%'`;
}

export async function resetSequences(sql: postgres.Sql) {
  // Reset any sequences that might affect test isolation
  // This is optional but can help with consistent test runs
}
import { EdgeWorker } from '@pgflow/edge-worker';

// Tests that default maxPgConnections is 4 (not the old hardcoded 10)
// NO maxPgConnections specified - should default to 4
EdgeWorker.start(
  async (_payload, { sql }) => {
    const queueName = 'conn_max_pg_default';
    const actualMax = sql.options.max;
    const status = actualMax === 4 ? 'success' : 'error';
    const errorMessage = actualMax === 4 ? null : `Expected max=4, got ${actualMax}`;

    await sql`
      INSERT INTO e2e_test_results (queue_name, status, actual, error_message)
      VALUES (${queueName}, ${status}, ${sql.json({ max: actualMax })}, ${errorMessage})
    `;

    return { max: actualMax };
  },
  { queueName: 'conn_max_pg_default' }
);

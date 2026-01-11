import { EdgeWorker } from '@pgflow/edge-worker';

// Tests that explicit maxPgConnections: 7 is respected
EdgeWorker.start(
  async (_payload, { sql }) => {
    const queueName = 'conn_max_pg_override';
    const actualMax = sql.options.max;
    const status = actualMax === 7 ? 'success' : 'error';
    const errorMessage = actualMax === 7 ? null : `Expected max=7, got ${actualMax}`;

    await sql`
      INSERT INTO e2e_test_results (queue_name, status, actual, error_message)
      VALUES (${queueName}, ${status}, ${sql.json({ max: actualMax })}, ${errorMessage})
    `;

    return { max: actualMax };
  },
  {
    queueName: 'conn_max_pg_override',
    maxPgConnections: 7,
  }
);

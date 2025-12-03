import { EdgeWorker } from '@pgflow/edge-worker';

// Uses connectionString option (takes priority over env var)
EdgeWorker.start(
  async (_payload, { sql }) => {
    await sql`SELECT nextval('conn_test_seq')`;
    return { mode: 'connection_string' };
  },
  {
    queueName: 'conn_string',
    connectionString: 'postgresql://postgres.pooler-dev:postgres@pooler:6543/postgres',
  }
);

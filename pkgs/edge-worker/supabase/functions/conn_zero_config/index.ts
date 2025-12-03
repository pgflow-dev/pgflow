import { EdgeWorker } from '@pgflow/edge-worker';

// No config - relies on Docker pooler auto-detection
// EDGE_WORKER_DB_URL must NOT be set for this function
EdgeWorker.start(
  async (_payload, { sql }) => {
    await sql`SELECT nextval('conn_test_seq')`;
    return { mode: 'zero_config' };
  },
  { queueName: 'conn_zero_config' }
);

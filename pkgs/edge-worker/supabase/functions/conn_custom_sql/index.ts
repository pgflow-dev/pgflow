import { EdgeWorker } from '@pgflow/edge-worker';
import postgres from 'postgres';

// Uses custom sql connection object
const customSql = postgres(
  'postgresql://postgres.pooler-dev:postgres@pooler:6543/postgres',
  { prepare: false }
);

EdgeWorker.start(
  async (_payload, { sql }) => {
    await sql`SELECT nextval('conn_test_seq')`;
    return { mode: 'custom_sql' };
  },
  {
    queueName: 'conn_custom_sql',
    sql: customSql,
  }
);

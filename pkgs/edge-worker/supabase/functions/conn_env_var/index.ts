import { EdgeWorker } from '@pgflow/edge-worker';

// Override Deno.env to return a specific EDGE_WORKER_DB_URL
// This tests that the env var is actually used (not falling back to docker pooler)
const ENV_KEY = 'EDGE_WORKER_DB_URL';
// Use the direct Supabase DB URL (not the docker-internal pooler URL)
// Inside Docker, we use the internal hostname 'db' which resolves to the postgres container
const EXPECTED_URL = 'postgresql://postgres:postgres@db:5432/postgres';
// This is the docker pooler URL that would be used as fallback
const DOCKER_POOLER_URL =
  'postgresql://postgres.pooler-dev:postgres@pooler:6543/postgres';

const originalGet = Deno.env.get.bind(Deno.env);
Deno.env.get = function (key: string) {
  if (key === ENV_KEY) {
    return EXPECTED_URL;
  }
  return originalGet(key);
};

const originalToObject = Deno.env.toObject.bind(Deno.env);
Deno.env.toObject = function () {
  return {
    ...originalToObject(),
    [ENV_KEY]: EXPECTED_URL,
  };
};

EdgeWorker.start(
  async (_payload, { sql, workerConfig }) => {
    const connectionString = workerConfig.connectionString;

    // If connectionString is undefined, the docker pooler fallback was used
    // If it equals DOCKER_POOLER_URL, the env var was ignored
    if (!connectionString || connectionString === DOCKER_POOLER_URL) {
      throw new Error(
        `EDGE_WORKER_DB_URL was not used! Got connectionString: ${connectionString}`
      );
    }

    // Verify the expected URL is being used
    if (connectionString !== EXPECTED_URL) {
      throw new Error(
        `Unexpected connectionString: ${connectionString}, expected: ${EXPECTED_URL}`
      );
    }

    // Success - env var is being used correctly
    await sql`SELECT nextval('conn_test_seq')`;
    return { mode: 'env_var', connectionString };
  },
  {
    queueName: 'conn_env_var',
    retry: { strategy: 'fixed', limit: 0, baseDelay: 1 },
  }
);

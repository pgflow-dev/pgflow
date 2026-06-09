const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:50322/postgres';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maxPgConnectionsHandler(queueName, expectedMax) {
  return async (_payload, { sql }) => {
    const actualMax = sql.options.max;
    const status = actualMax === expectedMax ? 'success' : 'error';
    const errorMessage = actualMax === expectedMax
      ? null
      : `Expected max=${expectedMax}, got ${actualMax}`;

    await sql`
      INSERT INTO e2e_test_results (queue_name, status, actual, error_message)
      VALUES (${queueName}, ${status}, ${sql.json({ max: actualMax })}, ${errorMessage})
    `;

    return { max: actualMax };
  };
}

function envVarHandler(expectedConnectionString) {
  return async (_payload, { sql, workerConfig }) => {
    const connectionString = workerConfig.connectionString;

    if (connectionString !== expectedConnectionString) {
      throw new Error(
        `Unexpected connectionString: ${connectionString}, expected: ${expectedConnectionString}`
      );
    }

    await sql`SELECT nextval('conn_test_seq')`;
    return { mode: 'env_var', connectionString };
  };
}

export const portableExamples = {
  max_concurrency: {
    name: 'max_concurrency',
    queueName: 'max_concurrency',
    sequenceName: 'test_seq',
    kind: 'sequence',
    messagesToSend: 200,
    expectedIncrement: 200,
    options: {
      queueName: 'max_concurrency',
      maxConcurrent: 10,
      maxPgConnections: 4,
    },
    handler: async (_payload, { sql }) => {
      await sleep(50);
      await sql`SELECT nextval('test_seq')`;
      return { processed: true };
    },
  },
  conn_max_pg_default: {
    name: 'conn_max_pg_default',
    queueName: 'conn_max_pg_default',
    kind: 'result',
    expectedMax: 4,
    messagesToSend: 1,
    options: {
      queueName: 'conn_max_pg_default',
    },
    handler: maxPgConnectionsHandler('conn_max_pg_default', 4),
  },
  conn_max_pg_override: {
    name: 'conn_max_pg_override',
    queueName: 'conn_max_pg_override',
    kind: 'result',
    expectedMax: 7,
    messagesToSend: 1,
    options: {
      queueName: 'conn_max_pg_override',
      maxPgConnections: 7,
    },
    handler: maxPgConnectionsHandler('conn_max_pg_override', 7),
  },
  conn_env_var: {
    name: 'conn_env_var',
    queueName: 'conn_env_var',
    sequenceName: 'conn_test_seq',
    kind: 'sequence',
    messagesToSend: 1,
    expectedIncrement: 1,
    options: {
      queueName: 'conn_env_var',
      retry: { strategy: 'fixed', limit: 0, baseDelay: 1 },
    },
    createHandler: ({ expectedConnectionString = DEFAULT_DB_URL }) =>
      envVarHandler(expectedConnectionString),
  },
};

export function getPortableExample(name) {
  const example = portableExamples[name];

  if (!example) {
    throw new Error(`Unknown portable example: ${name}`);
  }

  return example;
}

export function startPortableExample(EdgeWorker, name, runtimeOptions = {}) {
  const example = getPortableExample(name);
  const handler = example.createHandler
    ? example.createHandler(runtimeOptions)
    : example.handler;

  return EdgeWorker.start(handler, {
    ...example.options,
    ...runtimeOptions.workerOptions,
  });
}

import { assertEquals, assertExists } from 'jsr:@std/assert';
import type postgres from 'postgres';
import { withSql } from '../sql.ts';
import { e2eConfig } from '../config.ts';
import {
  sendBatch,
  seqLastValue,
  startWorker,
  waitFor,
} from '../e2e/_helpers.ts';
import { getPortableExample } from '../../supabase/functions/_shared/portable_examples.js';

const SERVICE_ROLE_KEY = 'test-service-role-key';
const PROCESS_FIXTURE = 'tests/e2e-portable-runtimes/portable-process-worker.mjs';

const PROCESS_RUNTIMES = [
  { name: 'node', command: 'node' },
  { name: 'bun', command: 'bun' },
] as const;

const EXAMPLES = [
  'max_concurrency',
  'conn_max_pg_default',
  'conn_max_pg_override',
  'conn_env_var',
] as const;

type ExampleName = typeof EXAMPLES[number];

type PortableExample =
  | {
      name: ExampleName;
      queueName: string;
      sequenceName: string;
      kind: 'sequence';
      messagesToSend: number;
      expectedIncrement: number;
    }
  | {
      name: ExampleName;
      queueName: string;
      kind: 'result';
      expectedMax: number;
      messagesToSend: number;
    };

function portableExample(exampleName: ExampleName): PortableExample {
  return getPortableExample(exampleName) as PortableExample;
}

async function resetQueue(sql: postgres.Sql, queueName: string) {
  await sql`
    SELECT * FROM pgmq.drop_queue(${queueName})
    WHERE EXISTS (
      SELECT 1 FROM pgmq.list_queues() WHERE queue_name = ${queueName}
    )
  `;
  await sql`SELECT pgmq.create(${queueName})`;
}

async function ensureEmptyQueue(sql: postgres.Sql, queueName: string) {
  const queues = await sql<{ queue_name: string }[]>`
    SELECT queue_name FROM pgmq.list_queues() WHERE queue_name = ${queueName}
  `;

  if (queues.length === 0) {
    await sql`SELECT pgmq.create(${queueName})`;
    return;
  }

  await sql`SELECT pgmq.purge_queue(${queueName})`;
}

async function resetExample(
  sql: postgres.Sql,
  exampleName: ExampleName,
  options: { preserveWorkerMetadata?: boolean; queueNameOverride?: string } = {}
) {
  const example = portableExample(exampleName);
  const queueName = options.queueNameOverride ?? example.queueName;

  if (options.preserveWorkerMetadata) {
    await ensureEmptyQueue(sql, queueName);
  } else {
    await resetQueue(sql, queueName);
  }

  if (example.kind === 'sequence') {
    await sql`CREATE SEQUENCE IF NOT EXISTS ${sql(example.sequenceName)}`;
    await sql`ALTER SEQUENCE ${sql(example.sequenceName)} RESTART WITH 1`;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS e2e_test_results (
      id SERIAL PRIMARY KEY,
      queue_name TEXT NOT NULL,
      status TEXT NOT NULL,
      actual JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`DELETE FROM e2e_test_results WHERE queue_name = ${queueName}`;

  if (!options.preserveWorkerMetadata && !options.queueNameOverride) {
    await sql`
      DELETE FROM pgflow.workers
      WHERE function_name = ${example.queueName}
        AND (
          stopped_at IS NOT NULL
          OR last_heartbeat_at < NOW() - INTERVAL '6 seconds'
        )
    `;
  }
}

async function waitForWorkerFunctionMode(
  sql: postgres.Sql,
  queueName: string,
  startMode: 'http' | 'process'
) {
  const row = await waitFor(
    async () => {
      const rows = await sql<{ start_mode: string }[]>`
        SELECT start_mode
        FROM pgflow.worker_functions
        WHERE function_name = ${queueName}
      `;

      const row = rows[0];
      return row?.start_mode === startMode ? row : false;
    },
    { description: `${queueName} worker_functions ${startMode} row` }
  );

  assertEquals(row.start_mode, startMode);
}

async function waitForResult(sql: postgres.Sql, queueName: string, expectedMax: number) {
  const row = await waitFor(
    async () => {
      const rows = await sql<{
        status: string;
        actual: { max?: number } | null;
        error_message: string | null;
      }[]>`
        SELECT status, actual, error_message
        FROM e2e_test_results
        WHERE queue_name = ${queueName}
        ORDER BY id DESC
        LIMIT 1
      `;

      return rows[0] ?? false;
    },
    { description: `${queueName} result row` }
  );

  assertEquals(row.status, 'success', row.error_message ?? undefined);
  assertEquals(row.actual?.max, expectedMax);
}

async function waitForExampleAssertion(
  sql: postgres.Sql,
  exampleName: ExampleName,
  sequenceStartValue?: number,
  queueNameOverride?: string
) {
  const example = portableExample(exampleName);
  const queueName = queueNameOverride ?? example.queueName;

  if (example.kind === 'result') {
    await waitForResult(sql, queueName, example.expectedMax);
    return;
  }

  assertExists(sequenceStartValue);

  await waitFor(
    async () => {
      const currentValue = await seqLastValue(example.sequenceName);
      return currentValue >= sequenceStartValue + example.expectedIncrement - 1
        ? currentValue
        : false;
    },
    {
      description: `${example.sequenceName} to increment by ${example.expectedIncrement}`,
      timeoutMs: example.name === 'max_concurrency' ? 60000 : 10000,
      pollIntervalMs: 500,
    }
  );
}

async function waitForFreshWorker(sql: postgres.Sql, queueName: string) {
  return await waitFor(
    async () => {
      const workers = await sql<{ worker_id: string }[]>`
        SELECT worker_id
        FROM pgflow.workers
        WHERE function_name = ${queueName}
          AND stopped_at IS NULL
          AND last_heartbeat_at >= NOW() - INTERVAL '6 seconds'
        ORDER BY started_at DESC
        LIMIT 1
      `;

      return workers[0] ?? false;
    },
    { description: `${queueName} active worker` }
  );
}

async function waitForProcessExit(
  child: Deno.ChildProcess,
  statusPromise: Promise<Deno.CommandStatus>,
  timeoutMs = 15000
) {
  const timeout = new Promise<false>((resolve) => {
    setTimeout(() => resolve(false), timeoutMs);
  });

  const status = await Promise.race([statusPromise, timeout]);

  if (status) return status;

  child.kill('SIGKILL');
  return await statusPromise;
}

function processEnv(exampleName: ExampleName, uniqueName: string) {
  const env: Record<string, string> = {
    ...Deno.env.toObject(),
    PORTABLE_EXAMPLE_NAME: exampleName,
    WORKER_NAME: uniqueName,
    PORTABLE_QUEUE_NAME: uniqueName,
    SUPABASE_URL: e2eConfig.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    EDGE_WORKER_LOG_LEVEL: 'warn',
  };

  if (exampleName === 'conn_env_var') {
    env.EDGE_WORKER_DB_URL = e2eConfig.dbUrl;
    env.PORTABLE_EXPECTED_CONNECTION_STRING = e2eConfig.dbUrl;
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = e2eConfig.dbUrl;
    delete env.EDGE_WORKER_DB_URL;
  }

  return env;
}

async function runProcessExample(
  sql: postgres.Sql,
  runtime: typeof PROCESS_RUNTIMES[number],
  exampleName: ExampleName
) {
  const example = portableExample(exampleName);
  const uniqueName = `${example.queueName}_${runtime.name}_${crypto.randomUUID().slice(0, 8)}`;

  await resetExample(sql, exampleName, { queueNameOverride: uniqueName });

  const child = new Deno.Command(runtime.command, {
    args: [PROCESS_FIXTURE],
    cwd: new URL('../..', import.meta.url).pathname,
    env: processEnv(exampleName, uniqueName),
    stdout: 'null',
    stderr: 'null',
  }).spawn();
  const statusPromise = child.status;
  let childExited = false;

  try {
    await waitForWorkerFunctionMode(sql, uniqueName, 'process');
    const worker = await waitForFreshWorker(sql, uniqueName);
    const sequenceStartValue = example.kind === 'sequence'
      ? await seqLastValue(example.sequenceName)
      : undefined;
    await sendBatch(example.messagesToSend, uniqueName);
    await waitForExampleAssertion(sql, exampleName, sequenceStartValue, uniqueName);

    child.kill('SIGTERM');
    const status = await waitForProcessExit(child, statusPromise);
    childExited = true;
    assertEquals(status.code, 0);

    const stoppedWorker = await waitFor(
      async () => {
        const rows = await sql<{ stopped_at: string | null }[]>`
          SELECT stopped_at
          FROM pgflow.workers
          WHERE worker_id = ${worker.worker_id}
        `;

        return rows[0]?.stopped_at ? rows[0] : false;
      },
      { description: `${runtime.name} ${uniqueName} stopped_at` }
    );

    assertExists(stoppedWorker.stopped_at);
  } finally {
    if (!childExited) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Child may already have exited after the assertion path.
      }

      await waitForProcessExit(child, statusPromise);
    }

    await sql`
      DELETE FROM pgflow.worker_functions
      WHERE function_name = ${uniqueName}
    `;
    await sql`DELETE FROM e2e_test_results WHERE queue_name = ${uniqueName}`;
  }
}

async function runSupabaseExample(sql: postgres.Sql, exampleName: ExampleName) {
  const example = portableExample(exampleName);
  await resetExample(sql, exampleName, { preserveWorkerMetadata: true });
  await startWorker(example.queueName);
  await waitForWorkerFunctionMode(sql, example.queueName, 'http');
  const sequenceStartValue = example.kind === 'sequence'
    ? await seqLastValue(example.sequenceName)
    : undefined;
  await sendBatch(example.messagesToSend, example.queueName);
  await waitForExampleAssertion(sql, exampleName, sequenceStartValue);
}

for (const exampleName of EXAMPLES) {
  Deno.test(
    {
      name: `portable runtimes - ${exampleName} works in supabase`,
      sanitizeOps: false,
      sanitizeResources: false,
    },
    () => withSql((sql) => runSupabaseExample(sql, exampleName))
  );

  for (const runtime of PROCESS_RUNTIMES) {
    Deno.test(
      {
        name: `portable runtimes - ${exampleName} works in ${runtime.name}`,
        sanitizeOps: false,
        sanitizeResources: false,
      },
      () => withSql((sql) => runProcessExample(sql, runtime, exampleName))
    );
  }
}

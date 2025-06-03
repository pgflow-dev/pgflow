import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import postgres from 'postgres';
import { PgflowSqlClient } from '../src/PgflowSqlClient.js';

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:50422/postgres';

function createSql() {
  return postgres(DB_URL, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Concurrency Race Condition Tests', () => {
  let sqlA: postgres.Sql;
  let sqlB: postgres.Sql;
  let clientA: PgflowSqlClient<any>;
  let clientB: PgflowSqlClient<any>;

  beforeEach(async () => {
    // Create separate connections for each worker
    sqlA = createSql();
    sqlB = createSql();
    clientA = new PgflowSqlClient(sqlA);
    clientB = new PgflowSqlClient(sqlB);

    // Reset the database
    await sqlA`SELECT pgflow_tests.reset_db()`;
  });

  afterEach(async () => {
    await sqlA.end();
    await sqlB.end();
  });

  test('race condition: two workers claim same step-task', async () => {
    // Setup: Create a minimal flow
    await sqlA`SELECT pgflow.create_flow('flow_slug', timeout => 10)`;
    await sqlA`SELECT pgflow.add_step('flow_slug', 'step_slug')`;

    // Start a run (one queue row, one step_task row)
    await sqlA`SELECT * FROM pgflow.start_flow('flow_slug', '{}'::jsonb)`;

    let taskA: any;
    let taskB: any;

    // Worker A: poll for tasks in transaction and commit immediately
    await sqlA.begin(async (txA) => {
      const clientATx = new PgflowSqlClient(txA);
      const tasksA = await clientATx.pollForTasks('flow_slug', 1, 5, 100, 10);
      expect(tasksA).toHaveLength(1);
      taskA = tasksA[0];
    });

    // Worker B: overlap section - same transaction with two polls
    const workerBPromise = sqlB.begin(async (txB) => {
      const clientBTx = new PgflowSqlClient(txB);

      // First poll should return 0 records (row locked)
      const firstPoll = await clientBTx.pollForTasks('flow_slug', 1, 5, 100, 10);
      expect(firstPoll).toHaveLength(0);

      // Sleep within same transaction/snapshot
      await sleep(100);

      // Second poll should return 0 records (race condition prevented)
      const secondPoll = await clientBTx.pollForTasks('flow_slug', 1, 5, 100, 10);
      expect(secondPoll).toHaveLength(0);
      
      // No taskB since the race condition was prevented
    });

    // Worker A: simulate user code execution
    await sleep(200);

    // Worker B: complete its transaction
    await workerBPromise;

    // Worker A: complete task (should succeed)
    await clientA.completeTask(taskA);

    // Test passed: Race condition was prevented, both workers didn't get the same task
  }, 30000);
});

import type { AnyFlow, ExtractFlowInput, Json } from '@pgflow/dsl';
import {
  createFlowWorker,
  type FlowWorkerConfig,
} from '../../src/flow/createFlowWorker.ts';
import type { postgres } from '../sql.ts';
import { PgflowSqlClient } from '@pgflow/core';
import type { PlatformAdapter } from '../../src/platform/types.ts';
import type { SupabaseResources, SupabaseEnv } from '@pgflow/dsl/supabase';
import type { ValidEnv, UserEnv } from '@pgflow/dsl';
import { createSql } from '../../src/core/sql-factory.ts';
import { createAnonSupabaseClient, createServiceSupabaseClient } from '../../src/core/supabase-utils.ts';

const DEFAULT_TEST_SUPABASE_ENV: SupabaseEnv = {
  EDGE_WORKER_DB_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SB_EXECUTION_ID: 'test-execution-id',
};

export async function startFlow<TFlow extends AnyFlow>(
  sql: postgres.Sql,
  flow: TFlow,
  input: ExtractFlowInput<TFlow>
) {
  const pgflow = new PgflowSqlClient<TFlow>(sql);

  return await pgflow.startFlow(flow.slug, input);
}

export function createTestPlatformAdapter(sql: postgres.Sql): PlatformAdapter<SupabaseResources> {
  const abortController = new AbortController();

  const platformResources: SupabaseResources = {
    sql,
    anonSupabase: createAnonSupabaseClient(DEFAULT_TEST_SUPABASE_ENV),
    serviceSupabase: createServiceSupabaseClient(DEFAULT_TEST_SUPABASE_ENV),
  };

  return {
    get env() { return DEFAULT_TEST_SUPABASE_ENV; },
    get shutdownSignal() { return abortController.signal; },
    get platformResources() { return platformResources; },
    get connectionString() { return DEFAULT_TEST_SUPABASE_ENV.EDGE_WORKER_DB_URL; },
    async startWorker(_createWorkerFn: (createLoggerFn: (module: string) => any) => any) {},
    async stopWorker() {},
  };
}

export function startWorker<TFlow extends AnyFlow>(
  sql: postgres.Sql, 
  flow: TFlow, 
  options: FlowWorkerConfig
) {
  const defaultOptions = {
    sql,
    maxConcurrent: 1,
    batchSize: 10,
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
  };

  const consoleLogger = {
    debug: console.log,
    info: console.log,
    warn: console.warn,
    error: console.error,
  };

  const worker = createFlowWorker(flow, mergedOptions, () => consoleLogger, createTestPlatformAdapter(sql));

  worker.startOnlyOnce({
    edgeFunctionName: 'test_flow',
    workerId: crypto.randomUUID(),
  });

  return worker;
}

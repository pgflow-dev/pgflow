import type { AnyFlow, ExtractFlowInput, Flow, Json } from '@pgflow/dsl';
import {
  createFlowWorker,
  type FlowWorkerConfig,
} from '../../src/flow/createFlowWorker.ts';
import type { postgres } from '../sql.ts';
import { PgflowSqlClient } from '@pgflow/core';

export async function startFlow<TFlow extends AnyFlow>(
  sql: postgres.Sql,
  flow: TFlow,
  input: ExtractFlowInput<TFlow>
) {
  const pgflow = new PgflowSqlClient<TFlow>(sql);

  return await pgflow.startFlow(flow.slug, input);
}

export function startWorker<
  T extends Json,
  S extends Record<string, Json> = Record<never, never>,
  D extends Record<string, string[]> = Record<string, string[]>
>(sql: postgres.Sql, flow: Flow<T, S, D>, options: FlowWorkerConfig) {
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

  const worker = createFlowWorker(flow, mergedOptions, () => consoleLogger);

  worker.startOnlyOnce({
    edgeFunctionName: 'test_flow',
    workerId: crypto.randomUUID(),
  });

  return worker;
}

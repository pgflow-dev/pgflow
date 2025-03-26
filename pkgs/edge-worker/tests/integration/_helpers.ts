
import type { Flow, Json } from "../../../dsl/src/index.ts";
import { createFlowWorker, type FlowWorkerConfig } from '../../src/flow/createFlowWorker.ts';
import type { postgres } from "../sql.ts";

export function startWorker<T extends Json>(sql: postgres.Sql, flow: Flow<T>, options: FlowWorkerConfig) {
  const defaultOptions = {
    sql,
    maxConcurrent: 1,
    batchSize: 10,
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
  }

  const worker = createFlowWorker(flow, mergedOptions);

  worker.startOnlyOnce({
    edgeFunctionName: 'test_flow',
    workerId: crypto.randomUUID(),
  });

  return worker;
}

export async function startFlow<T extends Json>(sql: postgres.Sql, flow: Flow<T>, input: T) {
  const [flowRun] = await sql<{ run_id: string }[]>`
    SELECT * FROM pgflow.start_flow(${flow.flowOptions.slug}::text, ${sql.json(input)}::jsonb);
  `;

  return flowRun;
}

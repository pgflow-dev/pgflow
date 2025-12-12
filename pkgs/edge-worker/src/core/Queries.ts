import type postgres from 'postgres';
import type { WorkerRow } from './types.js';
import type { FlowShape, Json } from '@pgflow/dsl';

export type EnsureFlowCompiledStatus = 'compiled' | 'verified' | 'recompiled' | 'mismatch';

export interface EnsureFlowCompiledResult {
  status: EnsureFlowCompiledStatus;
  differences: string[];
}

export class Queries {
  constructor(private readonly sql: postgres.Sql) {}

  async onWorkerStarted({
    queueName,
    workerId,
    edgeFunctionName,
  }: {
    queueName: string;
    workerId: string;
    edgeFunctionName: string;
  }): Promise<WorkerRow> {
    const [worker] = await this.sql<WorkerRow[]>`
      INSERT INTO pgflow.workers (queue_name, worker_id, function_name)
      VALUES (${queueName}, ${workerId}, ${edgeFunctionName})
      RETURNING *;
    `;

    return worker;
  }

  async onWorkerStopped(workerRow: WorkerRow): Promise<WorkerRow> {
    const [worker] = await this.sql<WorkerRow[]>`
      UPDATE pgflow.workers AS w
      SET deprecated_at = clock_timestamp(), last_heartbeat_at = clock_timestamp()
      WHERE w.worker_id = ${workerRow.worker_id}
      RETURNING *;
    `;

    return worker;
  }

  async sendHeartbeat(workerRow: WorkerRow): Promise<{ is_deprecated: boolean }> {
    const [result] = await this.sql<{ is_deprecated: boolean }[]>`
      UPDATE pgflow.workers AS w
      SET last_heartbeat_at = clock_timestamp()
      WHERE w.worker_id = ${workerRow.worker_id}
      RETURNING (w.deprecated_at IS NOT NULL) AS is_deprecated;
    `;

    return result || { is_deprecated: false };
  }

  async ensureFlowCompiled(
    flowSlug: string,
    shape: FlowShape,
    allowDataLoss = false
  ): Promise<EnsureFlowCompiledResult> {
    // SAFETY: FlowShape is JSON-compatible by construction (only strings, numbers,
    // arrays, and plain objects), but TypeScript can't prove this because FlowShape
    // uses specific property names while Json uses index signatures. This cast is
    // safe because we control both sides: extractFlowShape() builds the object and
    // this method consumes it - no untrusted input crosses this boundary.
    //
    // TODO: If FlowShape ever becomes part of a public API or accepts external input,
    // add a runtime assertion function (assertJsonCompatible) to validate at the boundary.
    const shapeJson = this.sql.json(shape as unknown as Json);
    const [result] = await this.sql<{ result: EnsureFlowCompiledResult }[]>`
      SELECT pgflow.ensure_flow_compiled(
        ${flowSlug},
        ${shapeJson}::jsonb,
        ${allowDataLoss}
      ) as result
    `;
    return result.result;
  }

  /**
   * Registers an edge function for monitoring by ensure_workers() cron.
   * Called by workers on startup. Sets last_invoked_at to prevent cron from
   * pinging during startup (debounce).
   */
  async trackWorkerFunction(functionName: string): Promise<void> {
    await this.sql`
      SELECT pgflow.track_worker_function(${functionName})
    `;
  }

  /**
   * Marks a worker as stopped for graceful shutdown signaling.
   * Called by workers on beforeunload to allow ensure_workers() to detect death immediately.
   */
  async markWorkerStopped(workerId: string): Promise<void> {
    await this.sql`
      SELECT pgflow.mark_worker_stopped(${workerId}::uuid)
    `;
  }
}

import type postgres from 'postgres';
import type { WorkerRow, WorkerStartMode } from './types.js';
import type { FlowShape, Json } from '@pgflow/dsl';
import { QueueProtocolMismatchError } from '../flow/errors.js';

export type EnsureFlowCompiledStatus = 'compiled' | 'verified' | 'recompiled' | 'mismatch';

/**
 * Startup handshake result (#650). Every non-mismatch status carries the
 * checked canonical queue and protocol version; the worker validates both
 * before registration/polling and does not trust an old-looking result.
 */
export type EnsureFlowCompiledResult =
  | { status: 'mismatch'; differences: string[] }
  | {
      status: Exclude<EnsureFlowCompiledStatus, 'mismatch'>;
      differences: string[];
      protocol_version: 1;
      queue_name: string;
    };

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

    return result || { is_deprecated: true };
  }

  async ensureFlowCompiled(
    flowSlug: string,
    shape: FlowShape
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
    const protocolJson = this.sql.json({ version: 1 } as Json);
    let result: { result: EnsureFlowCompiledResult } | undefined;
    try {
      [result] = await this.sql<{ result: EnsureFlowCompiledResult }[]>`
        SELECT pgflow.ensure_flow_compiled(
          ${flowSlug},
          ${shapeJson}::jsonb,
          ${protocolJson}::jsonb
        ) as result
      `;
    } catch (error) {
      // Translate only the missing queue-capable startup function into an
      // actionable coordinated-upgrade error; ordinary connection errors stay
      // database errors and there is no fallback to the old signature.
      if (
        error instanceof Error &&
        /function pgflow\.ensure_flow_compiled.*does not exist/.test(error.message)
      ) {
        throw new QueueProtocolMismatchError(
          flowSlug,
          `The database has no queue-capable pgflow.ensure_flow_compiled(text, jsonb, jsonb) function.`
        );
      }
      throw error;
    }
    return result!.result;
  }

  /**
   * Registers an edge function for monitoring by ensure_workers() cron.
   * Called by workers on startup. Sets last_invoked_at to prevent cron from
   * pinging during startup (debounce).
   */
  async trackWorkerFunction(functionName: string, startMode: WorkerStartMode = 'http'): Promise<void> {
    if (startMode === 'http') {
      await this.sql`
        SELECT pgflow.track_worker_function(${functionName})
      `;
      return;
    }

    await this.sql`
      SELECT pgflow.track_worker_function(${functionName}, ${startMode})
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

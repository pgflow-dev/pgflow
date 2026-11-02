import type postgres from 'postgres';
import { withStartupTimeout } from './withStartupTimeout.js';
import type { WorkerRow, WorkerStartMode } from './types.js';
import type {
  FlowShape,
  Json,
  QueueMode,
  StepRoute,
} from '@pgflow/dsl';

export type EnsureFlowCompiledStatus = 'compiled' | 'verified' | 'recompiled' | 'mismatch';

/** Which deployment metadata layer drifted on a production mismatch. */
export type EnsureFlowMismatchKind = 'shape' | 'routing';

export interface EnsureFlowCompiledResult {
  status: EnsureFlowCompiledStatus;
  differences: string[];
  /** Present only on mismatch: DAG shape drift vs queue mode/route drift. */
  mismatchKind?: EnsureFlowMismatchKind;
}

export class WorkerInvocationRejectedError extends Error {
  constructor() {
    super('Worker invocation is expired, superseded, dismissed, or already accepted');
    this.name = 'WorkerInvocationRejectedError';
  }
}

export class Queries {
  constructor(private readonly sql: postgres.Sql) {}

  async onWorkerStarted({
    queueName,
    workerId,
    edgeFunctionName,
    pgflowVersion,
    invocationId,
  }: {
    queueName: string;
    workerId: string;
    edgeFunctionName: string;
    pgflowVersion: string;
    invocationId?: string;
  }): Promise<WorkerRow> {
    if (invocationId) {
      const accept = () => withStartupTimeout(this.sql, (sql) => sql<WorkerRow[]>`
        SELECT * FROM pgflow.accept_worker_invocation(
          ${edgeFunctionName}, ${invocationId}::uuid, ${workerId}::uuid,
          ${queueName}, ${pgflowVersion}
        )
      `, invocationId);
      // A connection can fail after COMMIT. Repeat the idempotent operation
      // once to recover the same worker, never to authorize another runtime.
      const [worker] = await accept().catch(() => accept());
      if (!worker) throw new WorkerInvocationRejectedError();
      return worker;
    }

    const [worker] = await this.sql<WorkerRow[]>`
      INSERT INTO pgflow.workers (queue_name, worker_id, function_name, pgflow_version)
      VALUES (${queueName}, ${workerId}, ${edgeFunctionName}, ${pgflowVersion})
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
    shape: FlowShape,
    queueMode: QueueMode = 'flow',
    routes: readonly StepRoute[] | null = null,
    invocationId?: string
  ): Promise<EnsureFlowCompiledResult> {
    // SAFETY: FlowShape is JSON-compatible by construction (only strings, numbers,
    // arrays, and plain objects), but TypeScript can't prove this because FlowShape
    // uses specific property names while Json uses index signatures. This cast is
    // safe because we control both sides: extractFlowShape() builds the object and
    // this method consumes it - no untrusted input crosses this boundary.
    const shapeJson = this.sql.json(shape as unknown as Json);
    // The ordered (stepSlug, queueName) route map: SQL derives the authoritative
    // routes from shape and mode and rejects a supplied map that disagrees (#651).
    // null omits the map and lets SQL derive it (legacy two-argument calls).
    const routesJson = routes === null
      ? null
      : this.sql.json(
          routes.map(({ stepSlug, queueName }) => ({ stepSlug, queueName })) as unknown as Json
        );
    const [result] = await withStartupTimeout(this.sql, (sql) => sql<{ result: EnsureFlowCompiledResult }[]>`
      SELECT pgflow.ensure_flow_compiled(
        ${flowSlug},
        ${shapeJson}::jsonb,
        ${queueMode}::text,
        ${routesJson}::jsonb
      ) as result
    `, invocationId);
    return result.result;
  }

  /**
   * Registers an edge function for monitoring by ensure_workers() cron.
   * Called by process workers and tokenless low-level bootstrap. HTTP handlers
   * reserve a startup invocation before initialization instead.
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

  async registerHttpWorkerFunction(functionName: string): Promise<void> {
    // Manual startup may discover an unregistered function, but cannot enable
    // a disabled registration or convert a process worker into an HTTP worker.
    await this.sql`
      INSERT INTO pgflow.worker_functions (function_name)
      VALUES (${functionName}) ON CONFLICT (function_name) DO NOTHING
    `;
  }

  async isWorkerHealthy(functionName: string, workerId: string): Promise<boolean> {
    const [result] = await this.sql<{ healthy: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pgflow.workers as w
        JOIN pgflow.worker_functions as wf ON wf.function_name = w.function_name
        WHERE wf.function_name = ${functionName} AND w.worker_id = ${workerId}::uuid
          AND wf.enabled AND wf.start_mode = 'http'
          AND w.stopped_at IS NULL AND w.deprecated_at IS NULL
          AND w.last_heartbeat_at > clock_timestamp() - wf.debounce
      ) as healthy
    `;
    return result.healthy;
  }

  async reserveWorkerInvocation(functionName: string): Promise<string | null> {
    const [result] = await this.sql<{ id: string | null }[]>`
      SELECT pgflow.reserve_worker_invocation(${functionName}) as id
    `;
    return result.id;
  }

  async reconcileWorkerInvocation(
    functionName: string, invocationId: string, workerId: string | null
  ): Promise<'pending' | 'ready' | 'rejected'> {
    const [result] = await this.sql<{ status: 'pending' | 'ready' | 'rejected' }[]>`
      SELECT pgflow.reconcile_worker_invocation(
        ${functionName}, ${invocationId}::uuid, ${workerId}::uuid
      ) as status
    `;
    return result.status;
  }

  async dismissWorkerInvocation(functionName: string, invocationId: string, reason: string): Promise<void> {
    await this.sql`
      SELECT pgflow.dismiss_worker_invocation(${functionName}, ${invocationId}::uuid, ${reason})
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

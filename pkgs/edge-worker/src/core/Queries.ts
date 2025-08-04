import type postgres from 'postgres';
import type { WorkerRow } from './types.js';

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
}

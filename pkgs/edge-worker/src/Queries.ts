import type postgres from 'postgres';
import type { WorkerRow } from './types.ts';

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
      INSERT INTO edge_worker.workers (queue_name, worker_id, function_name)
      VALUES (${queueName}, ${workerId}, ${edgeFunctionName})
      RETURNING *;
    `;

    return worker;
  }

  async onWorkerStopped(workerRow: WorkerRow): Promise<WorkerRow> {
    const [worker] = await this.sql<WorkerRow[]>`
      UPDATE edge_worker.workers AS w
      SET stopped_at = now(), last_heartbeat_at = now()
      WHERE w.worker_id = ${workerRow.worker_id}
      RETURNING *;
    `;

    return worker;
  }

  async sendHeartbeat(workerRow: WorkerRow): Promise<void> {
    await this.sql<WorkerRow[]>`
      UPDATE edge_worker.workers AS w
      SET last_heartbeat_at = now()
      WHERE w.worker_id = ${workerRow.worker_id}
      RETURNING *;
    `;
  }
}

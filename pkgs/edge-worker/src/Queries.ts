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
    const workers = await this.sql<WorkerRow[]>`
      SELECT * FROM edge_worker.on_worker_stopped(${workerRow.worker_id}::uuid);
    `;

    return workers[0];
  }

  async sendHeartbeat(workerRow: WorkerRow): Promise<void> {
    await this.sql<WorkerRow[]>`
      SELECT * FROM edge_worker.send_heartbeat(worker_id => ${workerRow.worker_id}::uuid);
    `;
  }
}

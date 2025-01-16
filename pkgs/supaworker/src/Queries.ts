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
    const workers = await this.sql<WorkerRow[]>`
      SELECT * FROM supaworker.on_worker_started(
        queue_name => ${queueName}::text,
        worker_id => ${workerId}::uuid,
        edge_fn_name => ${edgeFunctionName}::text
      );
    `;

    return workers[0];
  }

  async onWorkerStopped(workerRow: WorkerRow): Promise<WorkerRow> {
    const workers = await this.sql<WorkerRow[]>`
      SELECT * FROM supaworker.on_worker_stopped(${workerRow.worker_id}::uuid);
    `;

    return workers[0];
  }

  async sendHeartbeat(workerRow: WorkerRow): Promise<void> {
    await this.sql<WorkerRow[]>`
      SELECT * FROM supaworker.send_heartbeat(worker_id => ${workerRow.worker_id}::uuid);
    `;
  }

  async spawnNewWorker(queueName: string): Promise<void> {
    console.log('spawnNewWorker', queueName);
    await this.sql`
      SELECT * FROM supaworker.spawn(${queueName}::text);
    `;
    console.log('SPAWNED', queueName);
  }
}

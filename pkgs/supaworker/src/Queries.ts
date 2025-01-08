import type postgres from 'postgres';
import type { WorkerRow } from './types.ts';

export class Queries {
  constructor(private readonly sql: postgres.Sql) {}

  async onWorkerStarted(queueName: string): Promise<WorkerRow> {
    const workers = await this.sql<WorkerRow[]>`
      SELECT * FROM supaworker.on_worker_started(${queueName}::text);
    `;

    return workers[0];
  }

  async onWorkerStopped(workerId: string): Promise<WorkerRow> {
    const workers = await this.sql<WorkerRow[]>`
      SELECT * FROM supaworker.on_worker_stopped(${workerId}::uuid);
    `;

    return workers[0];
  }

  async sendHeartbeat(workerId: string, functionName?: string): Promise<void> {
    if (functionName) {
      await this.sql<WorkerRow[]>`
        SELECT * FROM supaworker.send_heartbeat(worker_id => ${workerId}::uuid, function_name => ${functionName}::text);
      `;
    } else {
      await this.sql<WorkerRow[]>`
        SELECT * FROM supaworker.send_heartbeat(worker_id => ${workerId}::uuid);
      `;
    }
  }

  async spawnNewWorker(queueName: string): Promise<void> {
    console.log('spawnNewWorker', queueName);
    await this.sql`
      SELECT * FROM supaworker.spawn(${queueName}::text);
    `;
    console.log('SPAWNED', queueName);
  }
}

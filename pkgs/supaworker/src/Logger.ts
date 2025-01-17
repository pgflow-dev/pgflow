import { WorkerRow } from './types.ts';

export class Logger {
  private workerRow?: WorkerRow;

  setWorkerRow(workerRow: WorkerRow) {
    this.workerRow = workerRow;
  }

  get workerId() {
    return this.workerRow?.worker_id;
  }

  log(message: string) {
    console.log(`[worker_id=${this.workerId}] ${message}`);
  }
}

export class Logger {
  constructor(private workerId: string = 'starting') {}

  setWorkerId(id: string) {
    this.workerId = id;
  }

  log(message: string) {
    console.log(`[worker_id=${this.workerId}] ${message}`);
  }
}

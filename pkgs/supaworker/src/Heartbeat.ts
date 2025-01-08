import type { Queries } from './Queries.ts';

export class Heartbeat {
  private lastHeartbeat = 0;

  constructor(
    private interval: number,
    private queries: Queries,
    private workerId: string,
    private log: (message: string) => void
  ) {}

  async send(functionName?: string): Promise<void> {
    const now = Date.now();
    if (now - this.lastHeartbeat >= this.interval) {
      await this.queries.sendHeartbeat(this.workerId, functionName);
      this.log('Heartbeat OK');
      this.lastHeartbeat = now;
    }
  }
}

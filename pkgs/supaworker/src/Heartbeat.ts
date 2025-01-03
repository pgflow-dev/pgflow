import type { Queries } from "./Queries.ts";

export class Heartbeat {
  private lastHeartbeat = 0;

  constructor(
    private interval: number,
    private queries: Queries,
    private workerId: string,
    private log: (message: string) => void,
  ) {}

  async send(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHeartbeat >= this.interval) {
      await this.queries.sendHeartbeat(this.workerId);
      this.log("Heartbeat OK");
      this.lastHeartbeat = now;
    }
  }
}

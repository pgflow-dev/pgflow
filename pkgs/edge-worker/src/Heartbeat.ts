import type { Queries } from './Queries.ts';
import { WorkerRow } from './types.ts';
import { getLogger } from './Logger.ts';

export class Heartbeat {
  private logger = getLogger('Heartbeat');
  private lastHeartbeat = 0;

  constructor(
    private interval: number,
    private queries: Queries,
    private workerRow: WorkerRow
  ) {}

  async send(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHeartbeat >= this.interval) {
      await this.queries.sendHeartbeat(this.workerRow);
      this.logger.debug('OK');
      this.lastHeartbeat = now;
    }
  }
}

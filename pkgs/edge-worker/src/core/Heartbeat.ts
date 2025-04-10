import type { Queries } from './Queries.js';
import type { WorkerRow } from './types.js';
import { getLogger } from './Logger.js';

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

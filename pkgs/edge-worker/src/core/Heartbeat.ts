import type { Queries } from './Queries.js';
import type { WorkerRow } from './types.js';
import type { Logger } from '../platform/types.js';

export class Heartbeat {
  private logger: Logger;
  private lastHeartbeat = 0;

  constructor(
    private interval: number,
    private queries: Queries,
    private workerRow: WorkerRow,
    logger: Logger
  ) {
    this.logger = logger;
  }

  async send(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHeartbeat >= this.interval) {
      await this.queries.sendHeartbeat(this.workerRow);
      this.logger.debug('OK');
      this.lastHeartbeat = now;
    }
  }
}

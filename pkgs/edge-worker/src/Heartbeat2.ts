import { getLogger } from './Logger.ts';

/**
 * Interface for objects that can send heartbeats
 */
interface HeartbeatSender {
  sendHeartbeat(): Promise<void>;
}

/**
 * Updated Heartbeat class that works with any heartbeat sender
 */
export class Heartbeat {
  private logger = getLogger('Heartbeat');
  private lastHeartbeat = 0;

  constructor(
    private interval: number,
    private sender: HeartbeatSender
  ) {}

  async send(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHeartbeat >= this.interval) {
      await this.sender.sendHeartbeat();
      this.logger.debug('OK');
      this.lastHeartbeat = now;
    }
  }
}
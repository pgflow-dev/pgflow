/**
 * Interface for objects that can send heartbeats
 */
export interface HeartbeatSender {
  sendHeartbeat(): Promise<void>;
}
import type { Json } from '../types.ts';

/**
 * Generic interface for polling messages from a queue
 */
export interface Poller<TPayload> {
  /**
   * Poll for new messages
   * @returns Promise resolving to an array of payloads
   */
  poll(): Promise<TPayload[]>;
}
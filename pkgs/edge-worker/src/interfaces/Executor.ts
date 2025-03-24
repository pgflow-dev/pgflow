/**
 * Generic interface for executing a payload
 */
export interface Executor<TPayload> {
  /**
   * Execute a payload
   * @param payload The payload to execute
   * @returns Promise that resolves when execution is complete
   */
  execute(payload: TPayload): Promise<void>;
  
  /**
   * Get the message ID for logging purposes
   */
  get msgId(): number | string;
}
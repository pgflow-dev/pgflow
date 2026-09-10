/**
 * Terminal worker error: a committed fatal claim batch. The SQL side already
 * committed the visibility reset and the HTTP restart pause; the worker must
 * stop without a retry cycle. The message carries only reason/queue/message
 * IDs - never message bodies.
 */
export class FatalWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalWorkerError';
  }
}

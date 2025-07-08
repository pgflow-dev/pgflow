import type { Json, IMessage } from '../core/types.js';
import type { Context } from '../core/context.js';

/**
 * Fields are nullable because types in postgres does not allow NOT NULL,
 * but all those values except `message` come from queue table columns,
 * which are explicitely marked as NOT NULL.
 */
export interface PgmqMessageRecord<TPayload extends Json | null = Json>
  extends IMessage {
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: TPayload;
}

/**
 * User-provided handler function, called for each message in the queue
 * Supports both legacy (message only) and new (message + context) signatures
 */
export type MessageHandlerFn<TPayload> = 
  | ((message: TPayload) => Promise<void> | void)
  | ((message: TPayload, context: Context<TPayload>) => Promise<void> | void);

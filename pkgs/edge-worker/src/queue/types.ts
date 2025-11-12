import type { Json, IMessage } from '../core/types.js';
import type { MessageHandlerContext } from '../core/context.js';

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
  headers?: Json | null;  // Optional for backward compatibility with pgmq 1.5.1+
}

/**
 * Generic message handler function that can work with any platform
 * @template TPayload - The message payload type
 * @template TContext - The context type (defaults to base MessageHandlerContext)
 */
export type MessageHandlerFn<
  TPayload extends Json = Json, 
  TContext extends MessageHandlerContext<TPayload> = MessageHandlerContext<TPayload>
> = (message: TPayload, context: TContext) => Promise<void> | void;

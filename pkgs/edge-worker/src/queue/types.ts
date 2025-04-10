import type { Json, IMessage } from '../core/types.js';

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

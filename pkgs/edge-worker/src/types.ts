export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface IPoller<IMessage> {
  poll(): Promise<IMessage[]>;
}

export interface IExecutor {
  get msgId(): number;
  execute(): Promise<unknown>;
}

export interface IMessage {
  msg_id: number;
}

export type PgmqMessageRecord<TPayload extends Json | null = Json> = {
  msg_id: number | null;
  read_ct: number | null;
  enqueued_at: string | null;
  vt: string | null;
  message: TPayload;
};

export type WorkerRow = {
  last_heartbeat_at: string;
  queue_name: string;
  started_at: string;
  stopped_at: string | null;
  worker_id: string;
  function_name: string;
};

// Make MessageRecord implement Json interface to fix type compatibility issues
export interface MessageRecord<MessagePayload extends Json = Json> extends Record<string, Json | undefined> {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: MessagePayload | null;
}

export interface WorkerBootstrap {
  edgeFunctionName: string;
  workerId: string;
}

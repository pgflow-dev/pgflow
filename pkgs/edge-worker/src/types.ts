export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PgmqMessageRecord = {
  msg_id: number | null;
  read_ct: number | null;
  enqueued_at: string | null;
  vt: string | null;
  message: Json | null;
};

export type WorkerRow = {
  last_heartbeat_at: string;
  queue_name: string;
  started_at: string;
  stopped_at: string | null;
  worker_id: string;
  function_name: string;
};

export interface MessageRecord<MessagePayload extends Json> {
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

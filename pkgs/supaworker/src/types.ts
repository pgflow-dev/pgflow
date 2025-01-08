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
};

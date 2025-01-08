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

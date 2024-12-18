import startWorker from "./startWorker.ts";
import spawnNewEdgeFunction from "./spawnNewEdgeFunction.ts";
import type { Database } from "../../../types.d.ts";

type MessagePayload = {
  run_id: string;
  step_slug: string;
};
type PgmqMessageRecord = Database["pgmq"]["CompositeTypes"]["message_record"];

export {
  type MessagePayload,
  type PgmqMessageRecord,
  startWorker,
  spawnNewEdgeFunction,
};

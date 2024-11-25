import { Json } from "../_pgflow/Flow.ts";

export default class SupabaseBackgroundTask extends Event {
  readonly eventId: string;
  readonly taskPromise: Promise<Json>;

  constructor(eventId: string, taskPromise: Promise<Json>) {
    super(eventId);

    this.eventId = eventId;
    this.taskPromise = taskPromise;
  }
}

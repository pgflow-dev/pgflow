import { Json } from "../Flow.ts";
import { type MessageRecord } from "./Worker.ts";
import { Queue } from "./Queue.ts";

export class MessageExecutor<MessagePayload extends Json> {
  private controller: AbortController;

  constructor(
    private readonly queue: Queue<MessagePayload>,
    private readonly record: MessageRecord<MessagePayload>,
    private readonly messageHandler: (message: MessagePayload) => Promise<void>,
  ) {
    this.controller = new AbortController();
  }

  get msgId() {
    return this.record.msg_id;
  }

  abort() {
    this.controller.abort();
  }

  async execute(): Promise<void> {
    try {
      await this.messageHandler(this.record.message!);

      if (!this.controller.signal.aborted) {
        await this.queue.archive(this.record.msg_id);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Message processing cancelled:", this.record.msg_id);
      } else {
        console.error("Error processing message:", error);
        // Re-queue the message on non-abort errors
        await this.queue.send(this.record.message!);
      }
    }
  }
}

import createQueueGenerator, {
  MessagePayload,
} from "./createQueueGenerator.ts";
import sql from "../../_pgflow/sql.ts";
import executeTask from "./executeTask.ts";
import { findStepTask } from "./findStepTask.ts";

async function processMessage(message: MessagePayload) {
  console.log("processMessage()", message);
  const stepTask = await findStepTask(message);
  return await executeTask(stepTask);
}

export default async function startWorker(channelName: string) {
  const { pollQueue, interruptPolling } = createQueueGenerator("pgflow");

  sql.listen(channelName, () => {
    console.log("pgflow worker interrupted");
    interruptPolling();
  });

  console.log("Started Polling");

  for await (const message of pollQueue()) {
    // @ts-ignore - TODO: fix the types
    EdgeRuntime.waitUntil(processMessage(message));
  }
}

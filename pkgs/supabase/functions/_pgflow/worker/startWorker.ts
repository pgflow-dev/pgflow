import { MessagePayload } from "./index.ts";
import sql from "../../_pgflow/sql.ts";
import executeTask from "./executeTask.ts";
import { findStepTask } from "./findStepTask.ts";
import readMessages from "./readMessages.ts";

async function processMessage(message: MessagePayload) {
  console.log("processMessage()", message);
  const stepTask = await findStepTask(message);
  return await executeTask(stepTask);
}

async function readAndProcessBatch() {
  const messages = await readMessages("pgflow");
  const messagesPayloads: MessagePayload[] = messages.map(
    (message) => message.message,
  ) as MessagePayload[];

  for (const messagePayload of messagesPayloads) {
    // @ts-ignore - TODO: fix the types
    EdgeRuntime.waitUntil(processMessage(messagePayload));
  }
}

export default async function startWorker(channelName: string) {
  console.log("Started wakeup listener");

  // TODO: probably need to clean this up when edgefn dies
  sql.listen(channelName, () => {
    console.log("Worker wake up");

    // @ts-ignore - TODO: fix the types
    EdgeRuntime.waitUntil(readAndProcessBatch());
  });

  console.log("Started Polling");
  setInterval(() => {
    console.log("... polling ...");
    // @ts-ignore - TODO: fix the types
    EdgeRuntime.waitUntil(readAndProcessBatch());
  }, 1000);
}

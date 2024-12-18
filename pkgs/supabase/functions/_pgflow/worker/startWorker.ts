import { MessagePayload } from "./index.ts";
import sql /*, { postgres }*/ from "../../_pgflow/sql.ts";
import executeTask from "./executeTask.ts";
import { findStepTask } from "./findStepTask.ts";
import readMessages from "./readMessages.ts";

const log = console.log;

// @ts-ignore - TODO: fix the types
const waitUntil = EdgeRuntime.waitUntil;

export async function processMessage(message: MessagePayload) {
  log("processMessage()", message);
  const stepTask = await findStepTask(message);
  return await executeTask(stepTask);
}

async function processMessages(shouldExit: { value: boolean }) {
  while (!shouldExit.value) {
    try {
      const messages = await readMessages("pgflow");
      const messagesPayloads: MessagePayload[] = messages.map(
        (message) => message.message,
      ) as MessagePayload[];

      for (const messagePayload of messagesPayloads) {
        waitUntil(processMessage(messagePayload));
      }
    } catch (error) {
      console.error("Error processing messages:", error);
      // Continue polling even if there's an error
    }
  }
  log("Polling stopped");
}

export default function startWorker(channelName: string) {
  log("Started wakeup listener");

  // Using an object to allow sharing the reference between functions
  const state = { value: false };

  sql.listen(channelName, () => {
    if (state.value) {
      return;
    }
    log("wakeup notification received");
  });

  log("Started Polling");
  // Start the continuous polling loop
  waitUntil(processMessages(state));

  function stopWorker() {
    log("Stopping worker...");
    state.value = true;
  }

  return { stopWorker };
}

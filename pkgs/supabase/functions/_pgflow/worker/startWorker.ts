import { MessagePayload } from "./index.ts";
import sql from "../../_pgflow/sql.ts";
import executeTask from "./executeTask.ts";
import { findStepTask } from "./findStepTask.ts";
import readMessages from "./readMessages.ts";

const POLLING_INTERVAL = 1000;

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

// TODO: find a better name
function doWork(msg = "polling") {
  console.log(msg);
  try {
    // @ts-ignore - TODO: fix the types
    EdgeRuntime.waitUntil(readAndProcessBatch());
  } catch (error) {
    console.error(`Error ${msg}:`, error);
  }
}

export default function startWorker(channelName: string) {
  console.log("Started wakeup listener");

  let listenPromise: Promise<void> | null = null;

  try {
    listenPromise = sql.listen(channelName, () => doWork("wakeup"));

    console.log("Started Polling");
    doWork();
    setInterval(doWork, POLLING_INTERVAL);
  } catch (error) {
    console.error("Error starting worker:", error);
  }

  return listenPromise;
}

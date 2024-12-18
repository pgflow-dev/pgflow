import { MessagePayload } from "./index.ts";
import sql /*, { postgres }*/ from "../../_pgflow/sql.ts";
import executeTask from "./executeTask.ts";
import { findStepTask } from "./findStepTask.ts";
import readMessages from "./readMessages.ts";

const POLLING_INTERVAL = 1000;

const log = console.log;

// @ts-ignore - TODO: fix the types
const waitUntil = EdgeRuntime.waitUntil;

async function processMessage(message: MessagePayload) {
  log("processMessage()", message);
  const stepTask = await findStepTask(message);
  return await executeTask(stepTask);
}

async function readAndProcessBatch() {
  const messages = await readMessages("pgflow");
  const messagesPayloads: MessagePayload[] = messages.map(
    (message) => message.message,
  ) as MessagePayload[];

  for (const messagePayload of messagesPayloads) {
    waitUntil(processMessage(messagePayload));
  }
}

// TODO: find a better name
function scheduleBatchProcessing(msg = "polling") {
  log(msg);
  try {
    waitUntil(readAndProcessBatch());
  } catch (error) {
    console.error(`Error ${msg}:`, error);
  }
}

export default function startWorker(channelName: string) {
  log("Started wakeup listener");

  // let listenRequest: postgres.ListenRequest;
  let shouldExit = false;

  sql.listen(channelName, () => {
    if (shouldExit) {
      return;
    }
    scheduleBatchProcessing("wakeup");
  });

  log("Started Polling");
  scheduleBatchProcessing();

  const interval = setInterval(scheduleBatchProcessing, POLLING_INTERVAL);

  function stopWorker() {
    log("Stopping worker...");
    shouldExit = true;

    if (interval) {
      clearInterval(interval);
    }
  }

  return { stopWorker };
}

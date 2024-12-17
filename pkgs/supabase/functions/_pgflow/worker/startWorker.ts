import createQueueGenerator from "./createQueueGenerator.ts";
import sql from "../../_pgflow/sql.ts";
import executeTask from "./executeTask.ts";
import { findStepTask } from "./findStepTask.ts";

export default async function startWorker(channelName: string) {
  const { pollQueue, interruptPolling } = createQueueGenerator("pgflow");

  sql.listen(channelName, interruptPolling);

  console.log("Started Polling");

  for await (const message of pollQueue()) {
    const stepTask = await findStepTask(message);
    await executeTask(stepTask);
  }
}

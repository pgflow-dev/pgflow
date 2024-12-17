import createQueueGenerator from "./createQueueGenerator.ts";
import sql from "../../_pgflow/sql.ts"; // sql.listen
import handlePgmqMessage from "./handlePgmqMessage.ts";

export default async function startWorker(channelName: string) {
  const { pollQueue, interruptPolling } = createQueueGenerator("pgflow");

  // Start listening for notifications
  sql.listen(channelName, (msg: string) => {
    console.log("NOTIFY", msg);
    interruptPolling(); // Interrupt the sleep when notification received
  });

  // Start polling
  console.log("Started Polling");

  for await (const message of pollQueue()) {
    await handlePgmqMessage(message);
  }
}

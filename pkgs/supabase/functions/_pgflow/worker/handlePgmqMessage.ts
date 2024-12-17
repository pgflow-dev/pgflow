import { createServiceRoleClient } from "../../_shared/supabaseClient.ts";
import executeTask from "./executeTask.ts";
import { MessagePayload } from "./createQueueGenerator.ts";
import { findStepTask } from "./findStepTask.ts";

export default async function handlePgmqMessage(message: MessagePayload) {
  const stepTask = await findStepTask(message);

  await executeTask(stepTask);
}

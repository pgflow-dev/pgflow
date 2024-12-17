import { createServiceRoleClient } from "../../_shared/supabaseClient.ts";
import executeTask from "../executeTask.ts";
import { MessagePayload } from "./createQueueGenerator.ts";
import { findStepTask } from "./findStepTask.ts";

const supabase = createServiceRoleClient();

export default async function handlePgmqMessage(message: MessagePayload) {
  console.log("handleMessage()", message);

  const stepTask = await findStepTask(message);

  await executeTask({ meta: message, payload: stepTask.payload }, supabase);
}

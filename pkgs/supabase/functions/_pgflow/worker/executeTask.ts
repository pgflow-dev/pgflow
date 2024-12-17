import { type Json } from "../../_pgflow/index.ts";
import {
  handleInput,
  startStepTask,
  completeStepTask,
  failStepTask,
} from "../../_pgflow/index.ts";
import { createServiceRoleClient } from "../../_shared/supabaseClient.ts";
import { type StepTaskRecord } from "./findStepTask.ts";

const supabase = createServiceRoleClient();

export default async function executeTask(stepTask: StepTaskRecord) {
  const meta = {
    run_id: stepTask.run_id,
    flow_slug: stepTask.flow_slug,
    step_slug: stepTask.step_slug,
  };
  const payload = stepTask.payload;
  const input = { meta, payload };

  await startStepTask(input, supabase);

  let result: Json;

  try {
    result = await handleInput(meta, payload);
  } catch (error: unknown) {
    console.log("ERROR:", error);
    // TODO: handle potential error from failStepTask call
    const errorToReport =
      error instanceof Error ? error : new Error(String(error));
    return await failStepTask(input, errorToReport, supabase);
  }

  // TODO: handle potential error from completeStepTask call
  return await completeStepTask(input, result, supabase);
}

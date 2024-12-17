import { type Json } from "../../_pgflow/index.ts";
import { handleInput } from "../../_pgflow/index.ts";
import startStepTask from "./startStepTask.ts";
import completeStepTask from "./completeStepTask.ts";
import failStepTask from "./failStepTask.ts";
import { type StepTaskRecord } from "./findStepTask.ts";
import { EdgeFnInput } from "../handleInput.ts";

export default async function executeTask(stepTask: StepTaskRecord) {
  const meta: EdgeFnInput["meta"] = {
    run_id: stepTask.run_id,
    flow_slug: stepTask.flow_slug,
    step_slug: stepTask.step_slug,
  } as EdgeFnInput["meta"];
  const payload = stepTask.payload;

  await startStepTask(stepTask);

  let result: Json;

  try {
    result = await handleInput(meta, payload);
  } catch (error: unknown) {
    console.log("ERROR:", error);
    // TODO: handle potential error from failStepTask call
    const errorToReport =
      error instanceof Error ? error : new Error(String(error));
    return await failStepTask(stepTask, errorToReport);
  }

  // TODO: handle potential error from completeStepTask call
  return await completeStepTask(stepTask, result);
}

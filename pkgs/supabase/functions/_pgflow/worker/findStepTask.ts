import type { Database } from "../../../types.d.ts";
import sql from "../../_pgflow/sql.ts";
import { type MessagePayload } from "./createQueueGenerator.ts";

type StepTaskRecord =
  Database["pgflow"]["Functions"]["find_step_task"]["Returns"];

export async function findStepTask({
  run_id,
  step_slug,
}: MessagePayload): Promise<StepTaskRecord> {
  const results = await sql`
    SELECT * FROM pgflow.find_step_task(${run_id}, ${step_slug});
  `;
  console.log("FIND_STEP_TASK", results);

  const stepTask = results[0] as StepTaskRecord;

  return stepTask;
}

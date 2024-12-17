import { Json } from "../Flow.ts";
import sql from "../sql.ts";
import { type StepTaskRecord } from "./findStepTask.ts";

export default async function completeStepTask(
  stepTask: StepTaskRecord,
  result: Json,
) {
  console.log("complete_step_task()", stepTask);

  const results = await sql`
    SELECT * FROM pgflow.complete_step_task(${stepTask.run_id}, ${stepTask.step_slug}, ${result})
  `;

  console.log("complete_step_task => results", results);
}

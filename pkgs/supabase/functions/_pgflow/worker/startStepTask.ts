import sql from "../sql.ts";
import { type StepTaskRecord } from "./findStepTask.ts";

export default async function startStepTask(stepTask: StepTaskRecord) {
  console.log("pgflow.start_step_task", stepTask);

  const results = await sql`
    SELECT * FROM pgflow.start_step_task(${stepTask.run_id}, ${stepTask.step_slug})
  `;

  console.log("pgflow.start_step_task results", results);

  // if (error) {
  //   throw error;
  // }

  return results[0];
}

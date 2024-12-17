import { Json } from "../Flow.ts";
import sql from "../sql.ts";
import { type StepTaskRecord } from "./findStepTask.ts";

export default async function failStepTask(
  stepTask: StepTaskRecord,
  error: any,
) {
  // console.log("fail_step_task()", stepTask);

  const errors = await sql`
    SELECT * FROM pgflow.fail_step_task(${stepTask.run_id}, ${
      stepTask.step_slug
    }, ${JSON.stringify(error)})
  `;

  // console.log("fail_step_task => errors", errors);
}

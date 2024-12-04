import { SupabaseClient } from "@supabase/supabase-js";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";

export default async function failStepTask(
  input: EdgeFnInput,
  taskError: Error,
  supabase: SupabaseClient,
) {
  console.log("pgflow.fail_step_task", input);

  const {
    meta: { run_id, step_slug },
  } = input;

  const { data, error } = await supabase
    .schema("pgflow")
    .rpc("fail_step_task", {
      run_id,
      step_slug,
      error: {
        message: taskError.message,
        stack: taskError.stack,
      },
    });

  if (error) {
    throw error;
  }

  return data;
}

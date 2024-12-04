import { SupabaseClient } from "@supabase/supabase-js";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";

export default async function completeStepTask(
  input: EdgeFnInput,
  result: Json,
  supabase: SupabaseClient,
) {
  console.log("pgflow.complete_step_task", input);

  const {
    meta: { run_id, step_slug },
  } = input;

  const { data, error } = await supabase
    .schema("pgflow")
    .rpc("complete_step_task", {
      run_id,
      step_slug,
      result,
    });

  if (error) {
    throw error;
  }

  return data;
}

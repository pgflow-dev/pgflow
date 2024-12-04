import { SupabaseClient } from "@supabase/supabase-js";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";

export default async function startStepTask(
  input: EdgeFnInput,
  supabase: SupabaseClient,
) {
  console.log("pgflow.start_step_task", input);

  const {
    meta: { run_id, step_slug },
  } = input;

  const { data, error } = await supabase
    .schema("pgflow")
    .rpc("start_step_task", { run_id, step_slug });

  if (error) {
    throw error;
  }

  return data;
}

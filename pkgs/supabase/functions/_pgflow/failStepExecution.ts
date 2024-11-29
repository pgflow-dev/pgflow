import { SupabaseClient } from "@supabase/supabase-js";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";

export default async function failStepExecution(
  input: EdgeFnInput,
  supabase: SupabaseClient,
) {
  console.log("pgflow.fail_step_execution", input);

  const {
    meta: { run_id, step_slug },
  } = input;

  const { data, error } = await supabase
    .schema("pgflow")
    .rpc("fail_step_execution", { run_id, step_slug });

  if (error) {
    throw error;
  }

  return data;
}

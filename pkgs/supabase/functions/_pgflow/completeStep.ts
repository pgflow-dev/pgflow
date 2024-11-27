import { SupabaseClient } from "@supabase/supabase-js";
import type { EdgeFnInput } from "./handleInput.ts";
import type { Json } from "../../types.d.ts";

export default async function completeStep(
  { run_id, step_slug }: EdgeFnInput["meta"],
  result: Json,
  supabase: SupabaseClient,
) {
  console.log("completeStep(meta, result)", {
    meta: { run_id, step_slug },
    result,
  });
  const { data, error: rpcError } = await supabase
    .schema("pgflow")
    .rpc("complete_step", {
      p_run_id: run_id,
      p_step_slug: step_slug,
      p_step_result: result,
    });
  console.log("completeStep() results:", { data, error: rpcError });

  if (rpcError) {
    throw new Error(rpcError.message);
  }

  return data;
}

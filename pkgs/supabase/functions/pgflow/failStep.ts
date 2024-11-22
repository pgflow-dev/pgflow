import { SupabaseClient } from "@supabase/supabase-js";
import type { EdgeFnInput } from "./handleInput.ts";

export default async function failStep(
  { run_id, step_slug }: EdgeFnInput["meta"],
  error: Error,
  supabase: SupabaseClient,
) {
  const { data, error: rpcError } = await supabase
    .schema("pgflow")
    .rpc("fail_step", {
      run_id,
      step_slug,
      error: error.message,
    });

  if (rpcError) {
    throw new Error(rpcError.message);
  }

  return data;
}

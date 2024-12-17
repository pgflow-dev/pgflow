import { type Json } from "../_pgflow/index.ts";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import {
  handleInput,
  startStepTask,
  completeStepTask,
  failStepTask,
} from "../_pgflow/index.ts";
import { SupabaseClient } from "@supabase/supabase-js";

export default async function executeTask(
  input: EdgeFnInput,
  supabase: SupabaseClient,
) {
  const { meta, payload } = input;
  let result: Json;

  await startStepTask(input, supabase);

  try {
    result = await handleInput(meta, payload);
  } catch (error: unknown) {
    console.log("ERROR:", error);
    // TODO: handle potential error from failStepTask call
    const errorToReport =
      error instanceof Error ? error : new Error(String(error));
    return await failStepTask(input, errorToReport, supabase);
  }

  // TODO: handle potential error from completeStepTask call
  return await completeStepTask(input, result, supabase);
}

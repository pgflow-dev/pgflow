/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import handleInput, { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import completeStep from "../_pgflow/completeStep.ts";
import failStep from "../_pgflow/failStep.ts";
import SupabaseBackgroundTask from "../_pgflow/SupabaseBackgroundTask.ts";

const supabase = createServiceRoleClient();

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();
  const { meta, payload } = input;

  // try {
  const taskPromise = handleInput(meta, payload);
  console.log("taskPromise", taskPromise);

  const backgroundTask = new SupabaseBackgroundTask(taskPromise);
  globalThis.dispatchEvent(backgroundTask);
  console.log("dispatched");

  globalThis.addEventListener("pgflow", async (event) => {
    console.log("event", event);

    const res = await (event as SupabaseBackgroundTask).taskPromise;
    const stepResult = await res.json();
    console.log("stepResult", stepResult);

    const completeStepResult = await completeStep(meta, stepResult, supabase);
    console.log("completeStepResult", completeStepResult);
  });

  // } catch (error) {
  //   console.log("ERROR: ", error);
  //
  //   const failStepResult = await failStep(meta, error, supabase);
  //   console.log("fail_step: ", failStepResult);
  // }

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

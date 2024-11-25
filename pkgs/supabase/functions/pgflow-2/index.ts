/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import handleInput, { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import completeStep from "../_pgflow/completeStep.ts";
import failStep from "../_pgflow/failStep.ts";
import SupabaseBackgroundTask from "../_pgflow/SupabaseBackgroundTask.ts";

const supabase = createServiceRoleClient();

let x = 0;

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();
  const { meta, payload } = input;

  // try {
  const taskPromise = handleInput(meta, payload);

  const eventId = `pgflow-${meta.run_id}-${meta.step_slug}`;
  const backgroundTask = new SupabaseBackgroundTask(eventId, taskPromise);
  globalThis.addEventListener(eventId, async (event) => {
    console.log(`event ${eventId}`, event);

    const stepResult = await (event as SupabaseBackgroundTask).taskPromise;
    console.log("stepResult", JSON.stringify(stepResult, null, 2));

    const completeStepResult = await completeStep(meta, stepResult, supabase);
    console.log(
      "completeStepResult",
      JSON.stringify(completeStepResult, null, 2),
    );
  });
  globalThis.dispatchEvent(backgroundTask);

  // } catch (error) {
  //   console.log("ERROR: ", error);
  //
  //   const failStepResult = await failStep(meta, error, supabase);
  //   console.log("fail_step: ", failStepResult);
  // }

  console.log("responding but x is ", x);
  x += 1;
  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

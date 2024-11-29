import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import handleInput, { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import { completeStep, failStep } from "../_pgflow/index.ts";

const supabase = createServiceRoleClient();

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();
  const { meta, payload } = input;

  try {
    const stepResult = await handleInput(meta, payload);
    console.log("STEP RESULTS: ", stepResult);

    const completeStepResult = await completeStep(meta, stepResult, supabase);
    console.log("complete_step: ", completeStepResult);
  } catch (error: unknown) {
    console.log("ERROR: ", error);

    const failStepResult = await failStep(meta, error, supabase);
    console.log("fail_step: ", failStepResult);
  }

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

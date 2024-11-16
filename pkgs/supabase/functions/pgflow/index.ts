/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import BasicFlow from "../_flows/BasicFlow.ts";

import { createClient } from "jsr:@supabase/supabase-js@^2.34.0";

export function createAuthenticatedClient(req: Request) {
  const authHeader = req.headers.get("Authorization")!;
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

Deno.serve(async (req: Request) => {
  const input = await req.json();
  console.log("input", input);

  const flowSteps = BasicFlow.getSteps();
  type StepNames = keyof typeof flowSteps;

  const run = input["run"];
  const step = input["step"];
  const slug = input["step"]["step_slug"];

  function assertStepSlug(slug: string): asserts slug is StepNames {
    if (!(slug in flowSteps)) {
      throw new Error(`Invalid step slug: ${String(slug)}`);
    }
  }

  // Create new input object without step key
  const handlerInput = { ...input };
  delete handlerInput["step"];

  assertStepSlug(slug);
  const stepResult = await flowSteps[slug].handler(handlerInput);
  console.log("stepResult", stepResult);

  const supabase = createAuthenticatedClient(req);
  const { error, data } = await supabase.schema("pgflow").rpc("complete_step", {
    p_run_id: run["run_id"],
    p_step_slug: step["step_slug"],
    p_step_result: stepResult,
  });
  console.log("complete_step", { data, error });

  return new Response(JSON.stringify(stepResult), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

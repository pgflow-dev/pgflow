/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import ProcessVoiceMemo from "../_flows/ProcessVoiceMemo.ts";

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

  const flowSteps = ProcessVoiceMemo.getSteps();
  type StepNames = keyof typeof flowSteps;

  const meta = input["meta"];
  const payload = input["payload"];

  const run_id = meta["run_id"];
  const flow_slug = meta["flow_slug"];
  const step_slug = meta["step_slug"];

  console.log(`${flow_slug}/${step_slug}: ${run_id}`, payload);

  function assertStepSlug(slug: string): asserts slug is StepNames {
    if (!(slug in flowSteps)) {
      throw new Error(`Invalid step slug: ${String(slug)}`);
    }
  }
  assertStepSlug(step_slug);

  const stepResult = await flowSteps[step_slug].handler(payload);
  console.log("stepResult", stepResult);

  const supabase = createAuthenticatedClient(req);
  const { error, data } = await supabase.schema("pgflow").rpc("complete_step", {
    p_run_id: run_id,
    p_step_slug: step_slug,
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

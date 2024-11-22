/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import ProcessVoiceMemo from "../_flows/ProcessVoiceMemo.ts";
import type { Json } from "../../types.d.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";

type EdgeFnInput = {
  meta: {
    run_id: string;
    flow_slug: string;
    step_slug: string;
  };
  payload: Json;
};

const supabase = createServiceRoleClient();

async function handleInput(input: EdgeFnInput) {
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

  const { error, data } = await supabase.schema("pgflow").rpc("complete_step", {
    p_run_id: run_id,
    p_step_slug: step_slug,
    p_step_result: stepResult,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

Deno.serve(async (req: Request) => {
  const input = await req.json();

  const stepResult = await handleInput(input);

  return new Response(JSON.stringify(stepResult), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

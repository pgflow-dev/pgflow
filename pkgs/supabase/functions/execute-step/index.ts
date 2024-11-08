/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAuthenticatedClient } from "../_shared/supabaseClient.ts";

Deno.serve(async (req: Request) => {
  const input = await req.json();

  const run = input["__run__"];
  const step = input["__step__"];

  console.log("input", input);

  const output = {
    step: step["step_slug"],
    currentTime: new Date().toISOString(),
  };
  // await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("output", output);

  const supabase = createAuthenticatedClient(req);
  const { error, data } = await supabase.schema("pgflow").rpc("complete_step", {
    p_run_id: run["run_id"],
    p_step_slug: step["step_slug"],
    p_step_result: output,
  });

  console.log("complete_step", { data, error });

  return new Response(JSON.stringify(output), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

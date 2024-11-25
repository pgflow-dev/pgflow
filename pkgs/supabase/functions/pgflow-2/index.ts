/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import BackgroundTaskHandler from "../_pgflow/BackgroundTaskHandler.ts";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";

globalThis.addEventListener("pgflow", async (event) => {
  const backgroundTask = event as BackgroundTaskHandler;
  const taskResult = await backgroundTask.handle();

  console.log("taskResult", JSON.stringify(taskResult, null, 2));
});

const supabase = createServiceRoleClient();

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();

  globalThis.dispatchEvent(new BackgroundTaskHandler(input, supabase));

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

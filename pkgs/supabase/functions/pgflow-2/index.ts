/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import BackgroundTaskHandler from "../_pgflow/BackgroundTaskHandler.ts";

const supabase = createServiceRoleClient();

globalThis.addEventListener("pgflow", async (event) => {
  const backgroundTask = event as BackgroundTaskHandler;
  const taskResult = await backgroundTask.handle();

  console.log("taskResult", JSON.stringify(taskResult, null, 2));
});

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();
  const { meta, payload } = input;

  globalThis.dispatchEvent(new BackgroundTaskHandler(input, supabase));

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

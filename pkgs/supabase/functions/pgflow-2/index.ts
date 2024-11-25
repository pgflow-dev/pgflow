/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import {
  BackgroundTaskEvent,
  setupBackgroundTaskListener,
} from "../_pgflow/BackgroundTask.ts";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";

setupBackgroundTaskListener(globalThis);

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();

  globalThis.dispatchEvent(new BackgroundTaskEvent(input));

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

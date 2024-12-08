// import "@supabase/functions-js/edge-runtime.d.ts";
import { startWorkers } from "../_pgflow/worker.ts";

Deno.serve(async (_req) => {
  EdgeRuntime.waitUntil(startWorkers(1, (m) => console.log("HANDLER", m)));

  return new Response(JSON.stringify("ok"), {
    headers: { "Content-Type": "application/json" },
  });
});

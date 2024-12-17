// import "@supabase/functions-js/edge-runtime.d.ts";
import { Json } from "../_pgflow/Flow.ts";
import { startWorker } from "../_pgflow/worker.ts";

async function handlePayload(payload: Json) {
  console.log("HANDLER HANDLING PAYLOAD", payload);
}

// @ts-ignore - TODO: fix the types
EdgeRuntime.waitUntil(startWorker("pgflow", handlePayload));

Deno.serve((_req) => {
  return new Response("ok", {
    headers: { "Content-Type": "application/json" },
  });
});

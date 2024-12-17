// import "@supabase/functions-js/edge-runtime.d.ts";
import { startWorker } from "../_pgflow/worker/index.ts";

// @ts-ignore - TODO: fix the types
EdgeRuntime.waitUntil(startWorker("pgflow"));

Deno.serve((_req) => {
  return new Response("ok", {
    headers: { "Content-Type": "application/json" },
  });
});

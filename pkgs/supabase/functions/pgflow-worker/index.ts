// import "@supabase/functions-js/edge-runtime.d.ts";
import { startWorker } from "../_pgflow/worker/index.ts";

// @ts-ignore - TODO: fix the types
EdgeRuntime.waitUntil(startWorker("pgflow"));

globalThis.onbeforeunload = () => {
  console.log("ON BEFORE UNLOAD");
  // @ts-ignore - TODO: fix the types
  // EdgeRuntime.waitUntil(stopWorker());
};

globalThis.onunload = () => {
  console.log("ON UNLOAD");
  // @ts-ignore - TODO: fix the types
  // EdgeRuntime.waitUntil(stopWorker());
};

Deno.serve((_req) => {
  return new Response("ok", {
    headers: { "Content-Type": "application/json" },
  });
});

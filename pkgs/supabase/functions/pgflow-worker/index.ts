// import "@supabase/functions-js/edge-runtime.d.ts";
import { startWorker } from "../_pgflow/worker/index.ts";

const { stopWorker } = startWorker("pgflow");

globalThis.onbeforeunload = () => stopWorker();

Deno.serve((_req) => {
  return new Response("ok", {
    headers: { "Content-Type": "application/json" },
  });
});

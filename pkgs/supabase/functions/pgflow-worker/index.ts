// import "@supabase/functions-js/edge-runtime.d.ts";
import { startWorker, spawnNewEdgeFunction } from "../_pgflow/worker/index.ts";

const { stopWorker } = startWorker("pgflow");

globalThis.onbeforeunload = () => {
  stopWorker();
  spawnNewEdgeFunction();
};

Deno.serve((_req) => {
  return new Response("ok", {
    headers: { "Content-Type": "application/json" },
  });
});

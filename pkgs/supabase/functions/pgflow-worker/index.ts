// import "@supabase/functions-js/edge-runtime.d.ts";
import { startWorker } from "../_pgflow/worker.ts";
import sql from "../_pgflow/sql.ts"; // sql.listen

const QUEUE_NAME = "pgflow";

// @ts-ignore - TODO: fix the types
EdgeRuntime.waitUntil(startWorker(QUEUE_NAME));

Deno.serve((_req) => {
  return new Response("ok", {
    headers: { "Content-Type": "application/json" },
  });
});

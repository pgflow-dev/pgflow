// import "@supabase/functions-js/edge-runtime.d.ts";
import { startWorker } from "../_pgflow/worker.ts";
import sql from "../_pgflow/sql.ts"; // sql.listen

const listener = sql.listen("yolo", (...argz: unknown[]) =>
  console.log("yolo", argz),
);
console.log("LISTENER", listener);

Deno.serve(async (_req) => {
  // @ts-ignore - TODO: fix the types
  EdgeRuntime.waitUntil(
    startWorker("worker", (m) => console.log("HANDLER", m)),
  );
  const result = await sql`SELECT now() as time;`;
  console.log("result");

  return new Response(JSON.stringify("ok"), {
    headers: { "Content-Type": "application/json" },
  });
});

// import "@supabase/functions-js/edge-runtime.d.ts";
// import { startWorkers } from "../_pgflow/worker.ts";
import sql from "../_pgflow/sql.ts"; // sql.listen

const listener = sql.listen("yolo", (...argz: unknown[]) =>
  console.log("yolo", argz),
);
console.log("LISTENER", listener);

Deno.serve(async (_req) => {
  // EdgeRuntime.waitUntil(startWorkers(1, (m) => console.log("HANDLER", m)));
  const result = await sql`SELECT now() as time;`;
  console.log("result");

  return new Response(JSON.stringify("ok"), {
    headers: { "Content-Type": "application/json" },
  });
});

// import "@supabase/functions-js/edge-runtime.d.ts";
import { useConnectionPool } from "../_pgflow/useConnectionPool.ts";

Deno.serve(async (_req) => {
  EdgeRuntime.waitUntil(
    (async () => {
      const { withPostgres } = await useConnectionPool();

      while (true) {
        const results = await withPostgres(
          async (client) => await client.queryObject(`SELECT NOW() as time`),
        );
        console.log("results", results);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    })(),
  );

  return new Response(JSON.stringify("ok"), {
    headers: { "Content-Type": "application/json" },
  });
});

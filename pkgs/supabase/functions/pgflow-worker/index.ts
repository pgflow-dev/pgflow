// import "@supabase/functions-js/edge-runtime.d.ts";
import { useConnectionPool } from "../_pgflow/useConnectionPool.ts";

Deno.serve(async (_req) => {
  EdgeRuntime.waitUntil(
    (async () => {
      const { queryObject, withPostgres } = await useConnectionPool();

      const queue = await queryObject(`SELECT pgmq.create('yolo');`);
      console.log("queue", queue);

      while (true) {
        const results = await withPostgres(
          async (client) =>
            await client.queryObject(`SELECT pgmq.read('yolo', 2, 1);`),
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

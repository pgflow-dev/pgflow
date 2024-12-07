// import "@supabase/functions-js/edge-runtime.d.ts";
import { useConnectionPool } from "../_pgflow/useConnectionPool.ts";

async function* pgmqMessageStream() {
  const { withPostgres } = await useConnectionPool();

  while (true) {
    yield* await withPostgres(
      async (client) =>
        await client.queryObject(`SELECT pgmq.read('yolo', 2, 1);`),
    );
  }
}

Deno.serve(async (_req) => {
  const worker = startWorker();

  console.log("worker", worker);

  // @ts-ignore TODO: fix type import
  EdgeRuntime.waitUntil(worker);

  return new Response(JSON.stringify("ok"), {
    headers: { "Content-Type": "application/json" },
  });
});

import "@supabase/functions-js/edge-runtime.d.ts";
import { useConnectionPool } from "../_pgflow/useConnectionPool.ts";
// edge-runtime.d.ts

async function* startWorker() {
  const { withPostgres } = await useConnectionPool();

  await withPostgres(async (client) => {
    const result = await client.queryObject`
        SELECT NOW() as time
      `;
    console.log("result", result);
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

Deno.serve(async (req) => {
  const worker = startWorker();

  EdgeRuntime.waitUntil(worker);

  return new Response(JSON.stringify("ok"), {
    headers: { "Content-Type": "application/json" },
  });
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/pgflow-worker' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/

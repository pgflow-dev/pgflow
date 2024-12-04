import executeTask from "../_pgflow/executeTask.ts";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";

const supabase = createServiceRoleClient();

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();

  EdgeRuntime.waitUntil(executeTask(input, supabase));

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

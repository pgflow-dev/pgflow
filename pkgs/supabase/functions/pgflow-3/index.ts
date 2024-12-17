import executeTask from "../_pgflow/executeTask.ts";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";

const supabase = createServiceRoleClient();

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();

  // @ts-ignore types are imported but code is provided by the supabase and it complains
  EdgeRuntime.waitUntil(executeTask(input, supabase));

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

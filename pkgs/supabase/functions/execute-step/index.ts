/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "jsr:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization")!;
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const input = await req.json();
  console.log("input", { input });

  const run = input["__run__"];
  const step = input["__step__"];

  const output = { step: step["step"], currentTime: new Date().toISOString() };
  // const output = { currentTime: new Date().toISOString(), input };
  // Add 1 second delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return new Response(JSON.stringify(output), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

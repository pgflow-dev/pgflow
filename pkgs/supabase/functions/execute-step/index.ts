/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  const input = await req.json();

  const step = input["__step__"];

  console.log("input", input);

  const output = { step: step["slug"], currentTime: new Date().toISOString() };
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("output", output);

  return new Response(JSON.stringify(output), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

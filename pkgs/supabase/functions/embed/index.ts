/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const model = new Supabase.ai.Session("gte-small");

Deno.serve(async (req: Request) => {
  const { input } = await req.json();
  const output = await model.run(input, { mean_pool: true, normalize: true });
  console.log({ input, output });
  return new Response(JSON.stringify(output), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "@supabase/functions-js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

Deno.serve(async (req: Request) => {
  const { input } = await req.json();

  const output = await openai.embeddings.create({
    input,
    model: "text-embedding-3-small",
  });
  console.log(output);

  return new Response(JSON.stringify(output.data[0].embedding), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

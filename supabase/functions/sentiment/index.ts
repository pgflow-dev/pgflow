// Follow this setup guide to integrate the Deno language server with your editor:
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.5.0'

// Configuration for Deno runtime
env.useBrowserCache = false;
env.allowLocalModels = false;

const classifier = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');

serve(async (req) => {
  const json = await req.json();
  console.log('json = ', json);

  const output = await classifier(json.input);

  // Return the embedding
  return new Response(
    JSON.stringify(output[0]),
    { headers: { 'Content-Type': 'application/json' } }
  );
});

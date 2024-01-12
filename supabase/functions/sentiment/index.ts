// Follow this setup guide to integrate the Deno language server with your editor:
import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.5.0'
import { corsHeaders } from '../_shared/cors.ts'

// Configuration for Deno runtime
env.useBrowserCache = false;
env.allowLocalModels = false;

// const classifier = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { input } = await req.json();
  // const output = await classifier(input);

  let label;

  if (Math.random() > 0.7) {
    label = "POSITIVE";
  }
  else if (Math.random() < 0.3) {
    label = "NEGATIVE";
  }
  else {
    label = "NEUTRAL";
  }

  const score = Math.random();
  const output = [{label, score}]

  return new Response(
    JSON.stringify(output),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

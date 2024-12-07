// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sleep } from "../_pgflow/utils.ts";

console.time("start");

async function backgroundWork() {
  console.timeLog("start");
  // Don't use sleep here - let the Edge Runtime handle the scheduling
  EdgeRuntime.waitUntil(backgroundWork());
}

Deno.serve(async (req) => {
  const { name } = await req.json();
  const data = {
    message: `Hello ${name}!`,
  };

  // Start the background work
  EdgeRuntime.waitUntil(backgroundWork());

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});

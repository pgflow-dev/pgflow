import executeTask from "../_pgflow/executeTask.ts";
// import { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";

// import { Pool } from "deno-postgres";
import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

// Deno.env.get("") ?? "",
// Create a pool with 5 connections
const POOL_CONNECTIONS = 5;
const DATABASE_URL =
  "postgresql://postgres:postgres@host.docker.internal:54322/postgres";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool(DATABASE_URL, POOL_CONNECTIONS);
console.log("POOL CREATED");

type EdgeFnPgmqInput = {
  queue_name: string;
};

async function processQueue(queueName: string) {
  let client;

  try {
    client = await pool.connect();
    console.log("Connected to Postgres", client);

    const obj = await client.queryObject(`SELECT gen_random_uuid()`);
    console.log("OBJ", obj);
  } catch (error) {
    console.error(error);
    return;
  } finally {
    client?.release();
  }
}

Deno.serve(async (req: Request) => {
  const input: EdgeFnPgmqInput = await req.json();
  const { queue_name: queueName } = input;

  EdgeRuntime.waitUntil(processQueue(queueName));

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

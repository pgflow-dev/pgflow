import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const POOL_CONNECTIONS = 5;
const DATABASE_URL =
  "postgresql://postgres:postgres@host.docker.internal:54322/postgres";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool(DATABASE_URL, POOL_CONNECTIONS);
console.log("POOL CREATED");

async function processQueue(queueName: string, pool: Pool) {
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

// import postgres from "postgres";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const sql = postgres(
  "postgresql://postgres:postgres@host.docker.internal:54322/postgres",
);

export default sql;
export { postgres };

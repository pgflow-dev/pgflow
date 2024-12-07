import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

export async function useConnectionPool() {
  const pool = new Pool(
    "postgresql://postgres:postgres@host.docker.internal:54322/postgres",
    5,
  );

  async function withPostgres(callback: (connection: any) => Promise<any>) {
    let connection;

    try {
      connection = await pool.connect();

      return await callback(connection);
    } catch (error) {
      console.error(error);
      return;
    } finally {
      connection?.release();
    }
  }

  return { pool, withPostgres };
}

import { assertEquals, assert } from 'jsr:@std/assert';
import postgres from 'postgres';
import { PostgreSqlContainer } from 'npm:@testcontainers/postgresql';

Deno.test('postgres', async () => {
  const sql = postgres(Deno.env.get('DB_URL')!);

  try {
    const results = await sql`select upper('hello')`;
    assertEquals(results[0].upper, 'HELLO');
  } finally {
    await sql.end();
  }
});

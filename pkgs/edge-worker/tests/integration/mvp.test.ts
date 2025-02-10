import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

export function createSql() {
  return postgres(DB_URL, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

Deno.test('mvp', async () => {
  let sql = createSql();

  try {
    const dbTime = await sql`select now()`;

    console.log(dbTime);
  }
  finally {
    await sql.end();
  }
});

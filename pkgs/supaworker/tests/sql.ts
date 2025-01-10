import postgres from 'postgres';

const sql = postgres(Deno.env.get('DB_URL')!, {
  onnotice(_) {
    // no-op to silence notices
  },
});

export { type postgres, sql };

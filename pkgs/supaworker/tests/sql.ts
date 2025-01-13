import postgres from 'postgres';

const sql = postgres(Deno.env.get('DB_URL')!, {
  prepare: false,
  onnotice(_) {
    // no-op to silence notices
  },
});

export { type postgres, sql };

import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:50322/postgres';

const sql = postgres(DB_URL, {
  prepare: true,
  onnotice(_) {
    // no-op to silence notices
  },
});

export { type postgres, sql };

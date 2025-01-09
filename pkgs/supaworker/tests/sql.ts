import postgres from 'postgres';

const sql = postgres(Deno.env.get('DB_URL')!);

export { type postgres, sql };

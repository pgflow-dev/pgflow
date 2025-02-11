import postgres from 'postgres';

function createSql(dbUrl: string) {
  return postgres(dbUrl, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

const utilSql = createSql(
  'postgresql://supabase_admin:postgres@localhost:5432/postgres'
)


// this function creates a new database from the template,
// initializes sql connection with createSql using modified
// dbUrl for that newly created database and calls callback with
// the sql connection
//
// it does everything in try/finally to ensure that the connection
// is closed and the database is dropped
//
// it uses some random string or sequence of characters as database name
//
// it returns a function that wraps the callback with the above logic
export function withTestDatabase(callback: (sql: postgres.Sql) => Promise<unknown>) {
  return async () => {
    const dbName = `test_${Math.random().toString(36).substring(2)}`;
    const dbUrl = `postgresql://supabase_admin:postgres@localhost:5432/${dbName}`;
    const sql = createSql(dbUrl);

    try {
      console.log('creating database', dbName);
      await utilSql`CREATE DATABASE ${utilSql(dbName)} WITH TEMPLATE postgres`;
      // console.log('granting to postgres');
      // await utilSql`GRANT ALL PRIVILEGES ON DATABASE ${utilSql(dbName)} TO postgres`;
      // console.log('granting to supabase_admin');
      // await utilSql`GRANT ALL PRIVILEGES ON DATABASE ${utilSql(dbName)} TO supabase_admin`;
      console.log('calling callback');
      await callback(sql);
      console.log('callback called');
    } finally {
      console.log('closing sql connection');
      await sql.end();
      console.log('dropping database', dbName);
      await utilSql`DROP DATABASE ${utilSql(dbName)}`;
      console.log('closing utilSql connection');
      await utilSql.end();
    }
  }
}

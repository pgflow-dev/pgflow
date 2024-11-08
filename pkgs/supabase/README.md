# supabase backend

## Snippets

> source: https://supabase.com/docs/guides/api/using-custom-schemas

### Make schema public

```sql
GRANT USAGE ON SCHEMA myschema TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA myschema TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA myschema TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA myschema TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA myschema GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA myschema GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA myschema GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
```

### supabase-js and custom schema

```javascript
// Initialize the JS client
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: "myschema" },
});

// Make a request
const { data: todos, error } = await supabase.from("todos").select("*");
```

### Connecting to pooler

```shall
DATABASE_URL="postgresql://postgres.pooler-dev:postgres@127.0.0.1:54329/postgres"

```

The tenant is hardcoded to `pooler-dev` on development, port changes to `54329`.

---
'@pgflow/edge-worker': patch
'@pgflow/dsl': patch
---

Add context object as second parameter to handlers

Queue and flow handlers now receive an optional context parameter that provides platform resources like database connections, environment variables, and Supabase clients - eliminating boilerplate and connection management.

```typescript
// Queue handler
EdgeWorker.start(async (payload, context) => {
  await context.sql`INSERT INTO tasks (data) VALUES (${payload})`;
});

// Flow step handler
.step({ slug: 'process' }, async (input, context) => {
  const result = await context.serviceSupabase.from('users').select();
})
```

**Core resources** (always available):

- `context.env` - Environment variables
- `context.shutdownSignal` - AbortSignal for graceful shutdown
- `context.rawMessage` - Original pgmq message with metadata
- `context.stepTask` - Current step task details (flow handlers only)

**Supabase platform resources**:

- `context.sql` - PostgreSQL client (postgres.js)
- `context.anonSupabase` - Supabase client with anonymous key
- `context.serviceSupabase` - Supabase client with service role key

To use Supabase resources in flows, import from the Supabase preset:

```typescript
import { Flow } from '@pgflow/dsl/supabase';
```

The context parameter is optional for backward compatibility - existing single-parameter handlers continue to work unchanged.

---
'@pgflow/edge-worker': patch
'@pgflow/website': patch
'@pgflow/dsl': patch
---

🚨 **BREAKING**: Remove `anonSupabase` and `serviceSupabase` from context, replaced with single `supabase` client (initialized with service role key)

The dual-client approach was unnecessary complexity. Edge Functions run in a trusted environment with service role access, so a single client is sufficient.

**Migration guide**:
```typescript
// Before
const { data } = await context.supabase.from('users').select();
const { data: publicData } = await context.anonSupabase.from('posts').select();

// After
const { data } = await context.supabase.from('users').select();
// For RLS-respecting queries, implement proper policies in your database
```

⚠️ **Breaking changes**:
- Removed `SUPABASE_ANON_KEY` from required environment variables
- Removed `anonSupabase` from context interface
- Removed `serviceSupabase` from context interface
- Added `supabase` field (initialized with service role key)
- Removed `createAnonSupabaseClient` function

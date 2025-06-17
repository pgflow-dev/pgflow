# Security Configuration for @pgflow/client

## Current Security Model

> [!WARNING]
> The permission model for pgflow is not finalized. This is a minimal MVP setup focused on security.
> 
> **Future versions will include Row Level Security (RLS) policies** to control which users can access which flows and runs. For now, all authenticated users can potentially see all runs if they know the run_id.
> 
> We need community feedback to design a proper permission model. Please share your use cases and security requirements in the [discussions](https://github.com/pgflow/pgflow/discussions).

## Required Permissions

To use @pgflow/client, your Supabase project needs the following minimal permissions:

```sql
-- Minimal permissions for @pgflow/client usage

-- 1. Schema access  
GRANT USAGE ON SCHEMA pgflow TO authenticated;
-- Note: anon role gets NO access by default

-- 2. Function access for client RPC calls (both are SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION pgflow.start_flow_with_states(text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pgflow.get_run_with_states(uuid) TO authenticated;

-- 3. Flow definition access (read-only for flow discovery)
GRANT SELECT ON TABLE pgflow.flows TO authenticated;
GRANT SELECT ON TABLE pgflow.steps TO authenticated;

-- 4. Service role needs full access for Edge Workers
GRANT ALL ON ALL TABLES IN SCHEMA pgflow TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA pgflow TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgflow TO service_role;

-- Note: We do NOT enable RLS yet because it would block access without policies.
-- When you're ready to add RLS:
-- 1. Enable RLS on the tables
-- 2. Create policies for your use case
-- 3. Test thoroughly
```

## Security Considerations

### What's Protected

1. **Anonymous users** - No access to pgflow at all
2. **Authenticated users** - Can only:
   - Start flows via `start_flow_with_states` function
   - Read run states via `get_run_with_states` function
   - View flow definitions (flows and steps tables)
3. **Direct table access** - Not granted (except for flow definitions)
4. **Mutations** - Only through SECURITY DEFINER functions

### Current Limitations

1. **No Row Level Security** - Any authenticated user can potentially:
   - Start any flow (if they know the slug)
   - View any run (if they know the run_id)
   - See all flow definitions

2. **No User Attribution** - Runs are not linked to specific users

3. **No Access Control** - Cannot restrict which users can run which flows

## Future Security Roadmap

We plan to implement:

1. **User Attribution**
   - Add `user_id` column to runs table
   - Link runs to `auth.uid()`

2. **Row Level Security Policies**
   ```sql
   -- Example: Users can only see their own runs
   CREATE POLICY "Users can see their own runs" 
     ON pgflow.runs FOR SELECT 
     USING (auth.uid() = user_id);
   ```

3. **Flow-level Permissions**
   - Control which users/roles can execute specific flows
   - Implement team/organization support

4. **Audit Logging**
   - Track who started which flows when
   - Monitor access patterns

## Implementing Custom Security

If you need security now, you can:

1. **Wrap the functions** - Create your own functions that check permissions before calling pgflow functions
2. **Use a service backend** - Call pgflow only from your secure backend, not directly from clients
3. **Add RLS policies** - Implement your own policies based on your requirements

## Questions or Concerns?

Please share your security requirements and use cases in our [GitHub discussions](https://github.com/pgflow/pgflow/discussions).
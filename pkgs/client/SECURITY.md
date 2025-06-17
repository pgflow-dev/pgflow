# Security Configuration for @pgflow/client

## ⚠️ Important: pgflow Does Not Handle Security Yet

**YOU are responsible for securing access to pgflow schemas, tables, and functions.**

pgflow is an MVP focused on workflow orchestration. It does not yet include built-in security features like Row Level Security policies, user attribution, or access controls. 

**By using pgflow, you acknowledge that:**
- Any authenticated user can potentially access all workflows and runs
- There are no built-in restrictions on who can start which flows
- Run data is not isolated between users or teams
- You must implement your own security layer if needed

## Direct Client Access Requirements

To use @pgflow/client from browsers or client applications, you need to:

1. **Expose the pgflow schema** via PostgREST (adds all pgflow tables to your API)
2. **Grant permissions** to authenticated users (see below)
3. **Accept the security implications** - all authenticated users can access all flows and runs

## Minimal Permission Grants

pgflow does not grant any permissions by default. To use @pgflow/client, you must run these grants:

**WARNING: This SQL grants broad permissions!**  
After running this, ANY authenticated user can:
- Start ANY flow
- View ANY run (if they know the run_id)
- See ALL flow definitions

```sql
-- 1. Schema access (required for any pgflow access)
GRANT USAGE ON SCHEMA pgflow TO authenticated;

-- 2. Function access for client operations
GRANT EXECUTE ON FUNCTION pgflow.start_flow_with_states(text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pgflow.get_run_with_states(uuid) TO authenticated;

-- 3. Read access to flow definitions
GRANT SELECT ON TABLE pgflow.flows TO authenticated;
GRANT SELECT ON TABLE pgflow.steps TO authenticated;

-- 4. Service role needs full access (for Edge Workers)
GRANT ALL ON ALL TABLES IN SCHEMA pgflow TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA pgflow TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgflow TO service_role;
```

This is suitable for development and trusted environments only.

## Alternative: Backend-Only Access (Recommended)

For production use, consider NOT exposing pgflow to clients at all:

1. **Use Edge Functions** - Create Supabase Edge Functions that use service_role key
2. **Backend API** - Call pgflow only from your secure backend services
3. **Custom Wrappers** - Create your own API layer with proper authentication

This approach gives you complete control over security without exposing pgflow directly.

## Implementing Your Own Security

Since pgflow doesn't handle security yet, you might want to:

1. **Add Row Level Security**
   ```sql
   -- Enable RLS on tables you want to protect
   ALTER TABLE pgflow.runs ENABLE ROW LEVEL SECURITY;
   
   -- Create your own policies based on your needs
   -- Example: Users can only see their own runs
   CREATE POLICY "Users see own runs" ON pgflow.runs
     FOR SELECT USING (auth.uid()::text = input->>'user_id');
   ```

2. **Wrap Functions with Security Checks**
   ```sql
   -- Create your own wrapper that checks permissions
   CREATE FUNCTION public.start_my_flow(input JSONB)
   RETURNS UUID AS $$
   BEGIN
     -- Add your security logic here
     IF NOT (check_user_can_start_flow(auth.uid())) THEN
       RAISE EXCEPTION 'Unauthorized';
     END IF;
     
     -- Call pgflow function
     RETURN pgflow.start_flow('my_flow', input);
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```

3. **Track User Attribution**
   - Store user_id in your flow input
   - Use this for your own access control logic

## Future Security Features

pgflow may eventually include:
- User attribution (linking runs to users)
- Row Level Security policies
- Flow-level access controls
- Audit logging

For now, implementing security is your responsibility.

## Questions?

If you have security concerns or suggestions, please share them in the [GitHub discussions](https://github.com/pgflow/pgflow/discussions).
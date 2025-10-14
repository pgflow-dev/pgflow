# Security Configuration for @pgflow/client

## ⚠️ Important: pgflow Does Not Handle Security Yet

**YOU are responsible for securing access to pgflow schemas, tables, and functions.**

pgflow is an MVP focused on workflow orchestration. It does not yet include built-in security features like Row Level Security policies, user attribution, or access controls.

**pgflow ships with ZERO permissions granted.** No users can access pgflow tables or functions after installation.

## Direct Client Access Requirements

To use @pgflow/client from browsers or client applications, you need to:

1. **Expose the pgflow schema** via PostgREST (adds all pgflow tables to your API)
2. **Grant permissions** to authenticated users (see below)
3. **Accept the security implications** - all authenticated users can access all flows and runs

## Minimal Permission Grants

pgflow ships with NO permissions. The SQL below is a **convenience snippet** that grants **BROAD permissions**.

> [!CAUTION]
> This SQL grants BROAD permissions! After running this, ANY authenticated user can:
> - Start ANY flow
> - View ANY run (if they know the run_id)
> - See ALL flow definitions
> 
> It is YOUR responsibility to:
> - Tailor these permissions to your specific needs
> - Implement Row Level Security policies
> - Add proper access controls

```sql
-- 1. Schema access (required for any pgflow access)
GRANT USAGE ON SCHEMA pgflow TO authenticated;

-- 2. Function access for client operations
GRANT EXECUTE ON FUNCTION pgflow.start_flow_with_states(text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pgflow.get_run_with_states(uuid) TO authenticated;

-- 3. Read access to flow definitions
GRANT SELECT ON TABLE pgflow.flows TO authenticated;
GRANT SELECT ON TABLE pgflow.steps TO authenticated;
```

This is suitable for development and trusted environments only.

## Implementing Your Own Security

Since pgflow doesn't handle security yet, you might want to:

1. **Add Row Level Security**
   
   The key to implementing RLS with pgflow is to include a `user_id` field in your flow's input object. This allows you to create policies that check if the current user matches the user who started the flow.
   
   First, include user_id in your flow input type:
   ```typescript
   import { Flow } from '@pgflow/dsl';
   
   // Define input type with user_id
   type MyFlowInput = {
     user_id: string;  // <<<<< Add this field
     data: string;
     // ... other fields
   };
   
   export const MyFlow = new Flow<MyFlowInput>({
     slug: 'my_secure_flow',
   })
   // ... rest of flow definition
   ```
   
   Then create RLS policies and an index for performance:
   ```sql
   -- Enable RLS on tables you want to protect
   ALTER TABLE pgflow.runs ENABLE ROW LEVEL SECURITY;
   
   -- Create index for better RLS performance
   CREATE INDEX idx_runs_user_id ON pgflow.runs ((input->>'user_id'));
   
   -- Create your own policies based on your needs
   -- Example: Users can only see their own runs
   CREATE POLICY "Users see own runs" ON pgflow.runs
     FOR SELECT USING ((SELECT auth.uid())::text = input->>'user_id');
   ```
   
   For more details about the pgflow schema and the `runs` table structure, see the [Schema Design section](../core/README.md#schema-design) in the core documentation.

2. **Track User Attribution**
   - Always include user_id in your flow input
   - Use this for your own access control logic in RLS policies

## Questions?

If you have security concerns or suggestions, please share them in the [GitHub discussions](https://github.com/pgflow-dev/pgflow/discussions).
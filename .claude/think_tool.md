# Using the think tool

Before actions or responding after tool results, use think tool to:
- List applicable rules for current request
- Verify all required info collected
- Check planned action compliance
- Validate tool results

Example for pgflow context:
```
User wants to modify start_flow function
- Check: schemas/*.sql files are source of truth
- Never edit migrations directly
- Plan: Edit schemas/0100_function_start_flow.sql, test with psql, regenerate migration
```
# SQL Style Guidelines

## Declarative > Procedural
**ALWAYS PRIORITIZE DECLARATIVE STYLE & BATCH OPERATIONS**

- Prefer `language sql` over `language plpgsql`
- Use set operations, not loops
- Use `FOR EACH STATEMENT` triggers, not `FOR EACH ROW`
- Return `SETOF` and join, don't call functions per row
- Avoid many tiny functions (overhead) - write expressive SQL instead

## Dynamic SQL
Only use `%I` (identifier) and `%L` (literal) with `FORMAT`. Never `%s` (except pre-formatted fragments).

## Fully Qualified Names
Always qualify columns and arguments:
- `SELECT table.* FROM table` not `SELECT * FROM table`
- `start_flow.run_id` not just `run_id` in functions

## Keyword Arguments
Use `param => "value"` NOT `param := "value"`
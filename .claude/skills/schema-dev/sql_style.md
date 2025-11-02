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

## Table Aliasing Convention
When working with dependencies/dependents, steps, and states:
- Use parent/child prefixes
- Use `_step` suffix for `pgflow.steps` tables
- Use `_state` suffix for `pgflow.step_states` tables
- `dep` should mean a row in `pgflow.deps`, NOT a parent dependency
- Do NOT use `dep` to indicate a row from steps or step_states

**Examples:**
```sql
-- Good: Clear parent/child with proper suffixes
SELECT
  parent_step.*,
  child_step.*,
  parent_state.*
FROM pgflow.steps AS parent_step
JOIN pgflow.steps AS child_step ON child_step.parent_id = parent_step.id
JOIN pgflow.step_states AS parent_state ON parent_state.step_id = parent_step.id

-- Bad: Ambiguous aliases
SELECT
  dep.*,  -- Is this a dependency row or a parent step?
  step.*  -- Which step?
FROM pgflow.steps AS dep
JOIN pgflow.steps AS step ON step.parent_id = dep.id
```

## Performance-First Design

**Use Section Comments Instead of Helper Functions**: Keep complex functions monolithic for performance. Use clear section comments:

```sql
-- ==========================================
-- MAIN SECTION: Description
-- ==========================================
WITH
-- ---------- Subsection ----------
cte_name AS (...)
```

This approach:
- Avoids function call overhead
- Preserves CTE optimization
- Simplifies atomicity
- Keeps related logic together

---
description: Guide SQL schema development in pgflow. Use when user asks to modify database schema, add/change PostgreSQL functions, tables, or make any SQL changes. Enforces TDD and psql iteration workflow.
---

# Schema Development Workflow

**CRITICAL**: Always edit files in `pkgs/core/schemas/` first. Iterate with psql until tests pass, then generate migrations (see migration-management skill).

## Table of Contents

- [Overview](#overview)
- [Quick Reference](#quick-reference)
- [TDD Workflow](#tdd-workflow)
- [SQL Style Guidelines](#sql-style-guidelines)
- [Common Pattern](#common-pattern)
- [When You're Done](#when-youre-done)

## Overview

**Two-phase approach:**
1. **Development** (this skill): Fast psql iteration, TDD, edit `schemas/*.sql`
2. **Migration** (migration-management skill): Generate migrations from schemas

**Key principle**: `pkgs/core/schemas/*.sql` files are the source of truth. Edit them, apply with psql, iterate until tests pass.

## Quick Reference

**Setup:**
```bash
cd pkgs/core
pnpm nx supabase:start core           # Start DB if needed
pnpm nx supabase:status core          # Get DB URL with PORT
```

**Development cycle:**
```bash
# 1. Write/run failing test
./scripts/run-test-with-colors supabase/tests/your_feature/test.sql

# 2. Edit schema (source of truth)
vim schemas/0100_function_start_flow.sql

# 3. Apply schema
psql "postgresql://postgres:postgres@127.0.0.1:PORT/postgres" -f schemas/0100_function_start_flow.sql

# 4. Test again
./scripts/run-test-with-colors supabase/tests/your_feature/test.sql

# 5. Repeat 2-4 until passing
```

**Run all tests:**
```bash
pnpm nx test:pgtap core
```

## TDD Workflow

### Step 1: Write Failing Test

Create pgTAP test in `supabase/tests/`:

```sql
BEGIN;
SELECT plan(2);
SELECT throws_ok($$SELECT pgflow.my_function('invalid')$$, 'error message');
SELECT lives_ok($$SELECT pgflow.my_function('valid')$$);
SELECT * FROM finish();
ROLLBACK;
```

### Step 2: Run Test (Should Fail)

```bash
./scripts/run-test-with-colors supabase/tests/my_feature/test.sql
```

**CRITICAL**: Test must fail for the EXPECTED reason:
- ✅ "function does not exist" or "column not found" = expected
- ✅ Expected error not raised = expected
- ❌ Syntax error = fix test syntax first
- ❌ Wrong assertion = fix test logic first

### Step 3: Edit Schema File

```bash
vim schemas/0100_function_start_flow.sql
```

Follow SQL style guidelines (see below or reference.md sql_style.md).

### Step 4: Apply Schema with psql

```bash
psql "postgresql://postgres:postgres@127.0.0.1:PORT/postgres" \
  -f schemas/0100_function_start_flow.sql
```

### Step 5: Run Test Again

```bash
./scripts/run-test-with-colors supabase/tests/my_feature/test.sql
```

### Step 6: Iterate

Repeat steps 3-5 until test passes.

### Step 7: Run All Tests

```bash
pnpm nx test:pgtap core
```

All tests must pass before generating migration.

## SQL Style Guidelines

See reference.md sql_style.md for complete guidelines.

**Key principles:**
- **Declarative > Procedural**: Prefer `language sql`, use set operations not loops
- **Fully qualified names**: `SELECT steps.* FROM pgflow.steps AS steps`
- **Keyword arguments**: `param => "value"` NOT `param := "value"`
- **Table aliasing**: Use `parent_step`, `child_step`, `parent_state`, `child_state` with `_step`/`_state` suffixes
- **Performance**: Use section comments instead of helper functions

## Common Pattern

For any schema change (add function, modify table, add validation):

1. Write failing test
2. Edit schema file in `schemas/`
3. Apply with psql
4. Run test
5. Repeat 2-4 until passing
6. Run all tests

**Find which schema file:**
```bash
grep -r "CREATE.*FUNCTION.*your_function" schemas/
grep -r "CREATE TABLE.*your_table" schemas/
```

## When You're Done

Once all tests pass, use **migration-management skill** to:
- Generate migration from schemas
- Verify migration
- Regenerate TypeScript types
- Commit everything together

**For stacked PRs**: Use `temp_` prefix during development, consolidate before main merge. See migration-management skill.

## Troubleshooting

**Test fails with "relation/function does not exist":**
```bash
# Find and apply the schema file
grep -r "CREATE.*your_object" schemas/
psql $DB_URL -f schemas/FOUND_FILE.sql
```

**psql command fails:**
```bash
pnpm nx supabase:start core
pnpm nx supabase:status core  # Get correct DB URL
```

**All tests fail:**
```bash
pnpm nx supabase:reset core  # Reapplies all schemas in order
```

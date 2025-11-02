---
description: Manage pgflow database migrations. Use when user asks to generate migration, regenerate migration, handle temp migrations, resolve migration conflicts, or fix atlas.sum issues.
---

# Migration Management

**CRITICAL**: Migrations are ALWAYS generated from `pkgs/core/schemas/*.sql` files. NEVER write migrations by hand.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Generating Migrations](#generating-migrations)
- [Regenerating Migrations](#regenerating-migrations)
- [Stacked PRs with temp_ Migrations](#stacked-prs-with-temp_-migrations)
- [After Migration Checklist](#after-migration-checklist)
- [Troubleshooting](#troubleshooting)

## Quick Reference

**Generate new migration:**
```bash
cd pkgs/core
./scripts/atlas-migrate-diff feature_name  # NO pgflow_ prefix (auto-added)
pnpm nx verify-migrations core
pnpm nx gen-types core
pnpm nx test:pgtap core
```

**Regenerate existing migration:**
```bash
migration_name=feature_name  # NO pgflow_ prefix
git rm -f supabase/migrations/*_pgflow_${migration_name}.sql
./scripts/atlas-migrate-hash --yes
pnpm nx supabase:reset core
./scripts/atlas-migrate-diff ${migration_name}
pnpm nx verify-migrations core
pnpm nx gen-types core
pnpm nx test:pgtap core
```

**Consolidate temp migrations (before merging to main):**
```bash
git rm -f supabase/migrations/*_pgflow_*temp_*.sql
./scripts/atlas-migrate-hash --yes
pnpm nx supabase:reset core
./scripts/atlas-migrate-diff actual_feature_name  # No temp_ prefix!
pnpm nx verify-migrations core
pnpm nx gen-types core
pnpm nx test:pgtap core
```

## Generating Migrations

### When to Generate

After schema development is complete and all tests pass:
- All changes in `pkgs/core/schemas/*.sql`
- Tested with psql (see schema-dev skill)
- All pgTAP tests passing

### Generation Process

```bash
cd pkgs/core
./scripts/atlas-migrate-diff your_feature_name  # NO pgflow_ prefix (auto-added)
# Creates: supabase/migrations/TIMESTAMP_pgflow_your_feature_name.sql

pnpm nx verify-migrations core  # Validates migration + checks schemas synced
pnpm nx gen-types core          # Regenerate TypeScript types
pnpm nx test:pgtap core         # Verify everything works
```

### Naming Conventions

- snake_case (e.g., `add_root_map_support`)
- Descriptive, indicates what changed
- One migration per PR/feature
- NO pgflow_ prefix (auto-added to filename)

### For Stacked PRs

Use `temp_` prefix:
```bash
./scripts/atlas-migrate-diff temp_feature_part_1
```

See [Stacked PRs section](#stacked-prs-with-temp_-migrations) below.

## Regenerating Migrations

### When to Regenerate

- Schema changes after review feedback
- Test failures requiring adjustments
- Simplifying/refactoring approach
- Consolidating temp migrations

### Regeneration Process

```bash
migration_name=your_feature_name  # NO pgflow_ prefix

# 1. Remove old migration (filename HAS pgflow_)
git rm -f supabase/migrations/*_pgflow_${migration_name}.sql

# 2. Reset hash & DB
./scripts/atlas-migrate-hash --yes
pnpm nx supabase:reset core

# 3. Make changes in schemas/*.sql (NOT migrations!)
vim schemas/0100_function_start_flow.sql

# 4. Regenerate from schemas
./scripts/atlas-migrate-diff ${migration_name}
pnpm nx verify-migrations core
pnpm nx gen-types core
pnpm nx test:pgtap core
```

**CRITICAL**: Changes must be in `pkgs/core/schemas/*.sql`, NEVER in `migrations/*.sql`

## Stacked PRs with temp_ Migrations

Use temporary migrations when developing across multiple stacked PRs (e.g., Graphite). Each PR passes CI independently, but users only see one final migration.

### Development Phase

Generate with `temp_` prefix for each PR:

```bash
# PR 1
./scripts/atlas-migrate-diff temp_add_step_validation
pnpm nx verify-migrations core
pnpm nx gen-types core
pnpm nx test:pgtap core
git commit -am "feat: add step validation (part 1)"

# PR 2 (stacked on PR 1)
./scripts/atlas-migrate-diff temp_add_error_handling
pnpm nx verify-migrations core
pnpm nx gen-types core
pnpm nx test:pgtap core
git commit -am "feat: add error handling (part 2)"
```

### Final Consolidation (Before Merging Top PR to Main)

```bash
# Remove ALL temp migrations
git rm -f supabase/migrations/*_pgflow_*temp_*.sql

# Reset & regenerate as single final migration
./scripts/atlas-migrate-hash --yes
pnpm nx supabase:reset core
./scripts/atlas-migrate-diff add_step_validation_and_error_handling  # No temp_!

# Verify everything
pnpm nx verify-migrations core
pnpm nx gen-types core
pnpm nx test:pgtap core

# Commit
git add .
git commit -m "feat: consolidate step validation and error handling"
```

**Key points:**
- Use lowercase `temp_` prefix (matches snake_case)
- Glob pattern `*_pgflow_*temp_*` catches all temp variations
- CI blocks temp migrations from main
- Only top PR in stack does consolidation

## After Migration Checklist

- [ ] `pnpm nx verify-migrations core` passes
- [ ] `pnpm nx gen-types core` completed
- [ ] `pnpm nx test:pgtap core` passes
- [ ] Committed `schemas/*.sql` and `migrations/*_pgflow_*.sql`
- [ ] If stacked PR: Used `temp_` OR consolidated before main merge

## Troubleshooting

### Migration name exists

```bash
git rm -f supabase/migrations/*_pgflow_${migration_name}.sql
./scripts/atlas-migrate-hash --yes
```

### Tests pass with psql but fail after migration

Schemas incomplete:

```bash
DB_URL=$(pnpm nx supabase:status core | grep "DB URL" | awk '{print $3}')
psql "$DB_URL" -c "\df pgflow.*"  # Check functions
psql "$DB_URL" -c "\dt pgflow.*"  # Check tables
# Ensure ALL changes in pkgs/core/schemas/*.sql, then regenerate
```

### Schemas not synced (atlas.sum issues)

```bash
cat supabase/migrations/atlas.sum | grep temp  # Check for stale temp
vim supabase/migrations/atlas.sum              # Remove if found
./scripts/atlas-migrate-hash --yes
pnpm nx supabase:reset core
```

### TypeScript types out of sync

```bash
pnpm nx gen-types core
pnpm nx verify-gen-types core
```

### DB inconsistent / won't start

```bash
pnpm nx supabase:stop core && \
pnpm nx supabase:start core && \
pnpm nx supabase:reset core
```

### Forgot to remove temp migrations before merge

CI will catch it. Fix:

```bash
git rm -f supabase/migrations/*_pgflow_*temp_*.sql
./scripts/atlas-migrate-hash --yes
pnpm nx supabase:reset core
./scripts/atlas-migrate-diff actual_feature_name
pnpm nx verify-migrations core
pnpm nx gen-types core
pnpm nx test:pgtap core
```

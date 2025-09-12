# Schema Development Workflow

**CRITICAL**: Always edit files in `pkgs/core/schemas/` first. NEVER write migrations by hand - always generate them.

Two-phase approach: 1) Development (psql iteration) 2) Migration (formal generation)

## Development Phase: Fast Iteration

### Get DB Connection
```bash
cd pkgs/core
pnpm nx supabase:status core  # Get DB URL
```

### Apply & Test Changes
```bash
# Edit schema files first
vim schemas/0100_function_start_flow.sql

# Apply schema
psql "postgresql://postgres:postgres@127.0.0.1:PORT/postgres" -f schemas/0100_function_start_flow.sql

# Test specific file
./scripts/run-test-with-colors supabase/tests/start_flow/test.sql

# Test all
pnpm nx test:pgtap core
```

### Development Cycle
1. Write failing pgTAP test in `supabase/tests/`
   - **CRITICAL**: Test MUST fail for the EXPECTED reason
   - Iterate test until it fails correctly (not for syntax/typos/wrong assertions)
2. **Edit schema file in `pkgs/core/schemas/`** (source of truth)
3. Apply with psql
4. Run test with `bin/run-test-with-colors`
5. Iterate until passing
6. Run all tests to verify no breakage

## Migration Generation

**IMPORTANT**: Never write migrations manually. Always generate from schemas/*.sql files.

### Generate Migration
```bash
cd pkgs/core
# Ensure all changes are in schemas/*.sql files first
./scripts/atlas-migrate-diff your_migration_name  # NO pgflow_ prefix (auto-added)
# Creates: supabase/migrations/TIMESTAMP_pgflow_your_migration_name.sql

pnpm nx verify-migrations core
pnpm nx test:pgtap core
```

**Naming**: snake_case, descriptive, one per PR/feature

## Regenerating Migrations

### When: After schema changes, review feedback, test failures

### Process
```bash
migration_name=add_map_step_type  # NO pgflow_ prefix

# 1. Remove old migration (filename HAS pgflow_)
git rm -f supabase/migrations/*_pgflow_${migration_name}.sql

# 2. Reset hash & DB
./scripts/atlas-migrate-hash --yes
pnpm nx supabase:reset core

# 3. Make changes in schemas/*.sql files (NOT in migrations!)
vim schemas/0100_function_start_flow.sql

# 4. Regenerate from schemas
./scripts/atlas-migrate-diff ${migration_name}
pnpm nx verify-migrations core
pnpm nx test:pgtap core
```

## Working with Stacked PRs (Graphite)

When developing features across multiple stacked PRs, use temporary migrations:

### Each PR in Stack
Follow normal development workflow (see above), but when generating migrations:
```bash
# Use TEMP_ prefix for non-final migrations
./scripts/atlas-migrate-diff TEMP_feature_part_1  # Will create *_pgflow_TEMP_*.sql
```

### Before Merging to Main (Top PR Only)
```bash
# Remove ALL temp migrations
git rm -f supabase/migrations/*_pgflow_{TEMP,temp}_*.sql

# Regenerate as final migration (follow "Regenerating Migrations" section above)
./scripts/atlas-migrate-diff actual_feature_name  # No TEMP_ prefix
```

### Why?
- Each PR passes CI independently
- Single clean migration ships to users
- CI automatically blocks TEMP_/temp_ migrations from main

## Best Practices

**Development**: Edit schemas/*.sql first, psql iteration, test incrementally, TDD
**Migrations**: Generate only (never hand-write), one per PR, descriptive names, test thoroughly, commit with schemas
**Temp Migrations**: Use TEMP_ prefix for stacked PRs, remove before final merge, CI enforces this
**Avoid**: Manual migration edits, forgetting to remove old migration, skipping hash reset, failing tests, mixing changes, merging temp migrations to main

## Troubleshooting

### Migration name exists
```bash
git rm -f supabase/migrations/*_pgflow_${migration_name}.sql
./scripts/atlas-migrate-hash --yes
```

### Tests pass with psql but fail after migration
```bash
# Likely schemas/*.sql files not complete
psql $DB_URL -c "\df pgflow.*"  # Check functions
psql $DB_URL -c "\dt pgflow.*"  # Check tables
# Ensure ALL schema changes are in pkgs/core/schemas/ then regenerate
```

### Schemas Not Synced
**Cause**: Stale temp migration in atlas.sum, uncommitted changes, or DB mismatch
```bash
cat supabase/migrations/atlas.sum | grep temp  # Check for temp migrations
vim supabase/migrations/atlas.sum  # Remove temp migration line if found
# Then follow regeneration process
```

### DB Inconsistent
```bash
pnpm nx supabase:stop core && pnpm nx supabase:start core && pnpm nx supabase:reset core
```

## Complete Example Workflow

```bash
cd pkgs/core
pnpm nx supabase:status core  # Get DB URL

# 1. TDD: Write failing test (must fail for EXPECTED reason!)
vim supabase/tests/start_flow/root_map_validation.test.sql
./scripts/run-test-with-colors supabase/tests/start_flow/root_map_validation.test.sql
# Iterate test until it fails correctly (not syntax/typo errors)

# 2. Iterate: Edit SCHEMAS (not migrations!), apply, test
vim schemas/0100_function_start_flow.sql  # SOURCE OF TRUTH
psql $DB_URL -f schemas/0100_function_start_flow.sql
./scripts/run-test-with-colors supabase/tests/start_flow/root_map_validation.test.sql

# 3. Generate migration from schemas when done
./scripts/atlas-migrate-diff add_root_map_support  # NO pgflow_ prefix
pnpm nx verify-migrations core
pnpm nx test:pgtap core

# 4. Commit schemas + generated migration
git add schemas/*.sql supabase/tests/**/*.test.sql supabase/migrations/*_pgflow_*.sql
git commit -m "feat: add root map support"
```

**Key**: Edit schemas/*.sql → Test with psql → Generate migration → Never hand-write migrations
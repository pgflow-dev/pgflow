# Atlas Migration Management

This directory contains configuration for generating pgflow database migrations using [Atlas](https://atlasgo.io/).

## Files

- `atlas.hcl` - Atlas configuration
- `Dockerfile` - Custom Postgres image with required extensions
- `supabase-baseline-schema.sql` - Schema baseline representing a fresh hosted Supabase project
- `fresh-extensions.txt` - Record of extensions in fresh Supabase (for reference)
- `dump-fresh-baseline.sh` - Script to regenerate baseline

## Docker Image

The `Dockerfile` builds a custom Postgres 17 image with extensions matching hosted Supabase.

**Reference:** [Supabase Postgres 17.6.1.054 Dockerfile](https://github.com/supabase/postgres/blob/17.6.1.054/Dockerfile-17)

### Installed Extensions

| Extension | Git Tag | Ext Version | Notes |
|-----------|---------|-------------|-------|
| pgmq | v1.5.1 | 1.5.1 | pgflow dependency (not in Supabase image) |
| pg_cron | v1.6.4 | 1.6 | Scheduled jobs (v1.6.3+ for PG17) |
| pg_net | v0.7.1 | 0.20.2 | HTTP requests from SQL |
| pgsodium | v3.1.6 | 3.1.9 | Cryptography primitives |
| supabase_vault | v0.2.8 | 0.3.1 | Secrets management (depends on pgsodium) |

### Building the Image

```bash
cd pkgs/core
./scripts/build-atlas-postgres-image
./scripts/push-atlas-postgres-image
```

## Baseline Schema

The baseline represents what a **fresh hosted Supabase project** looks like before pgflow migrations.

### Pre-installed Extensions (hosted Supabase)

| Extension | Status |
|-----------|--------|
| `supabase_vault` | Pre-installed |
| `pgmq` | Available, not installed |
| `pg_cron` | Available, not installed |
| `pg_net` | Available, not installed |

Our migrations must `CREATE EXTENSION` for pgmq, pg_cron, and pg_net.

### Local CLI Difference

The local Supabase CLI pre-installs `pg_net`, but hosted Supabase does not. The `dump-fresh-baseline.sh` script accounts for this by dropping `pg_net` before dumping to match hosted behavior.

## Regenerating the Baseline

Run this when:
- Supabase CLI version changes significantly
- Adding new Supabase-provided schemas to baseline

```bash
cd pkgs/core/atlas
./dump-fresh-baseline.sh
```

The script will:
1. Create a fresh Supabase project in `supabase/` (temp, gitignored)
2. Drop `pg_net` to match hosted Supabase defaults
3. Verify extension assumptions match hosted Supabase
4. Dump schema and extension list
5. Clean up temp project

## Generating Migrations

After updating SQL in `supabase/migrations/`, run from `pkgs/core/`:

```bash
pnpm nx atlas:migrate:diff core --name="description_of_change"
```

This compares the current schema against the baseline + existing migrations.

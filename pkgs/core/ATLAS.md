# Atlas setup

We use [Atlas](https://atlasgo.io/docs) to generate migrations from the declarative schemas stored in `./schemas/` folder.

## Configuration

The setup is configured in `atlas.hcl`.

It is set to compare `schemas/` to what is in `supabase/migrations/`.

### Docker dev image

Atlas requires a dev database to be available for computing diffs.
The database must be empty, but contain everything needed for the schemas to apply.

We need a configured [PGMQ](https://github.com/tembo-io/pgmq) extension, which Atlas does not support
in their dev images.

That's why this setup relies on a custom built image `jumski/postgres-17-pgmq:latest`.

Inspect `Dockerfile.atlas` to see how it is built.

See also `./scripts/build-atlas-postgres-image` and `./scripts/push-atlas-postgres-image` scripts for building and pushing the image.

## Workflow

1. Make sure you start with a clean database (`pnpm supabase db reset`).
1. Modify the schemas in `schemas/` to a desired state.
1. Run `./scripts/atlas-migrate-diff <migration-name>` to create a new migration based on the diff.
1. Run `pnpm supabase migration up` to apply the migration.
1. In case of any errors, remove the generated migration file, make changes in `schemas/` and repeat the process.
1. After the migration is applied, verify it does not break tests with `nx test:pgtap`

# pgflow

## 0.13.0

### Patch Changes

- Updated dependencies [05738ed]
  - @pgflow/core@0.13.0

## 0.12.0

### Minor Changes

- 37402eb: BREAKING: Asymmetric handler signatures - remove `run` key from step inputs

  - Root steps: `(flowInput, ctx) => ...` - flow input directly as first param
  - Dependent steps: `(deps, ctx) => ...` - only dependency outputs as first param
  - Access flow input in dependent steps via `await ctx.flowInput` (async/lazy-loaded)
  - Lazy loading prevents data duplication for map steps processing large arrays
  - Enables functional composition and simplifies types for future subflows

### Patch Changes

- 5dc5cfc: Fix Supabase Edge Runtime compatibility by replacing npm:postgres with jsr:@oscar6echo/postgres fork. The npm package fails to parse database URLs in Deno edge environments, causing CONNECT_TIMEOUT errors.
- Updated dependencies [37402eb]
  - @pgflow/core@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [0cb5500]
  - @pgflow/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [0b84bb0]
- Updated dependencies [90276ce]
  - @pgflow/core@0.10.0

## 0.9.1

### Patch Changes

- 992a86b: Unify connection configuration with improved local detection. The `connectionString` config option now works correctly, and you can pass a raw postgres.js `sql` instance via `config.sql` for full control over connection options (SSL, pooling, etc.).

  Fixes [#469](https://github.com/pgflow-dev/pgflow/issues/469), [#424](https://github.com/pgflow-dev/pgflow/issues/424). Thanks to [@Nciso](https://github.com/Nciso), [@mikz](https://github.com/mikz), [@ddlaws0n](https://github.com/ddlaws0n), and **PixelEcho** for feedback and bug reports.

  - @pgflow/core@0.9.1

## 0.9.0

### Minor Changes

- 9fa2dd0: ## @pgflow/edge-worker

  - Add ControlPlane HTTP server for flow compilation (`ControlPlane.serve()`)
  - Support namespace imports for flow registration

  ## @pgflow/cli

  ### Breaking Changes

  - `pgflow compile` now takes flow slug instead of file path
  - Compilation happens via HTTP to ControlPlane (local Deno no longer required)
  - Deprecate `--deno-json` flag (will be removed in v1.0)

  ### New Features

  - `pgflow install` now scaffolds complete setup:
    - Creates `supabase/flows/` with example GreetUser flow
    - Creates `supabase/functions/pgflow/` Control Plane
    - Creates `supabase/functions/greet-user-worker/` example worker
  - Add `--control-plane-url` option to compile command
  - Dynamic version injection in generated deno.json files

### Patch Changes

- @pgflow/core@0.9.0

## 0.8.1

### Patch Changes

- f1d3c32: Fix incorrect Supabase CLI version requirement from 2.34.3 to 2.50.3. CLI 2.50.3 is the first version to include pgmq 1.5.0+, which is required for pgflow 0.8.0+.
- Updated dependencies [f1d3c32]
  - @pgflow/core@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [7380237]
  - @pgflow/core@0.8.0

## 0.7.3

### Patch Changes

- @pgflow/core@0.7.3

## 0.7.2

### Patch Changes

- Updated dependencies [c22a1e5]
  - @pgflow/core@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies [a71b371]
  - @pgflow/core@0.7.1

## 0.7.0

### Patch Changes

- 9553bfd: Fix: Use --config instead of --import-map for Deno compilation

  The compile command now uses Deno's --config flag instead of --import-map, enabling full deno.json support including nodeModulesDir, compilerOptions, unstable features, and other configuration options. Previously, these options would cause "Invalid top-level key" warnings.

  This is a backward-compatible bug fix. Existing deno.json files with only "imports" continue to work as before.

- 28252d9: Fix config.toml corruption when updating minimal configurations (issue #143)
- 0d4623e: Fix config.toml corruption with minimal configs while preserving comments. Switch to @decimalturn/toml-patch 0.3.7 (maintained fork) which fixes issue #143 and preserves TOML comments and formatting. Thanks to @DecimalTurn for maintaining the fork and contributing this fix.
- Updated dependencies [524db03]
- Updated dependencies [524db03]
  - @pgflow/core@0.7.0

## 0.6.1

### Patch Changes

- @pgflow/core@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [81d552f]
  - @pgflow/core@0.6.0

## 0.5.4

### Patch Changes

- @pgflow/core@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies [af787ff]
  - @pgflow/core@0.5.3

## 0.5.2

### Patch Changes

- @pgflow/core@0.5.2

## 0.5.1

### Patch Changes

- @pgflow/core@0.5.1

## 0.5.0

### Patch Changes

- @pgflow/core@0.5.0

## 0.4.3

### Patch Changes

- Updated dependencies [fa78968]
  - @pgflow/core@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [220c867]
  - @pgflow/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [50ab557]
  - @pgflow/core@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [98556d3]
  - @pgflow/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [d08fd2d]
  - @pgflow/core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [c3653fa]
  - @pgflow/core@0.3.0

## 0.2.6

### Patch Changes

- 7eed629: Make compile generate migration timestamp using UTC
  - @pgflow/core@0.2.6

## 0.2.5

### Patch Changes

- 69390b4: Make sure install command creates migrations using UTC timestamps
  - @pgflow/core@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [2f13e8b]
  - @pgflow/core@0.2.4

## 0.2.3

### Patch Changes

- @pgflow/core@0.2.3

## 0.2.2

### Patch Changes

- 5e82c04: Improve migration copy functionality in CLI

  - always generate a new timestamp-id for the copied migration
  - prepend the timestamp to the original migration name
  - when comparing installed migrations to source migrations, search for source migration filename

  This change should be backwards compatible with already installed migrations,
  because the matching logic will just match the source filename in destination folder.

  - @pgflow/core@0.2.2

## 0.2.1

### Patch Changes

- 3f3174e: Update the README's
- Updated dependencies [d553c07]
  - @pgflow/core@0.2.1

## 0.2.0

### Minor Changes

- 68f166b: Improve outro messaging

### Patch Changes

- @pgflow/core@0.2.0

## 0.1.23

### Patch Changes

- 57aece4: Sort out outputs and flow filename extraction
  - @pgflow/core@0.1.23

## 0.1.22

### Patch Changes

- @pgflow/core@0.1.22

## 0.1.21

### Patch Changes

- Updated dependencies [ea1ce78]
  - @pgflow/core@0.1.21

## 0.1.20

### Patch Changes

- Updated dependencies [09e3210]
- Updated dependencies [985176e]
  - @pgflow/core@0.1.20

## 0.1.19

### Patch Changes

- db66f8e: Add installation improvements: auto-detect Supabase path, support non-interactive mode, update config.toml, migrate SQL files, and set required environment variables with validation scripts.
- Updated dependencies [a10b442]
- Updated dependencies [efbd108]
  - @pgflow/core@0.1.19

## 0.1.18

### Patch Changes

- 3a7e132: Do not build edge-worker for npm
- Updated dependencies [3a7e132]
  - @pgflow/core@0.1.18

## 0.1.17

### Patch Changes

- d215ed2: Trigger version change
- Updated dependencies [d215ed2]
  - @pgflow/core@0.1.17

## 0.1.16

### Patch Changes

- cc7c431: Test release to verify combined publishing of both npm and jsr packages
- Updated dependencies [cc7c431]
  - @pgflow/core@0.1.16

## 0.1.15

### Patch Changes

- ce34a2c: Update release pipeline to publish to jsr
- Updated dependencies [ce34a2c]
  - @pgflow/core@0.1.15

## 0.1.14

### Patch Changes

- @pgflow/core@0.1.14

## 0.1.13

### Patch Changes

- @pgflow/core@0.1.13

## 0.1.12

### Patch Changes

- @pgflow/core@0.1.12

## 0.1.11

### Patch Changes

- b456210: Fix npm: specifier
  - @pgflow/core@0.1.11

## 0.1.10

### Patch Changes

- bafe767: Fix deno/ folder for cli being missing
- bafe767: Fixed the path to deno/internal_compile.js
- Updated dependencies [bafe767]
  - @pgflow/core@0.1.10

## 0.1.9

### Patch Changes

- 1a30c6c: Make sure to tag and push tags
- Updated dependencies [1a30c6c]
  - @pgflow/core@0.1.9

## 0.1.8

### Patch Changes

- 05f5bd8: Update release script
- Updated dependencies [05f5bd8]
  - @pgflow/core@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies
  - @pgflow/core@0.1.7

## 0.1.6

### Patch Changes

- Test release to verify problem with bumping edge-worker
- Updated dependencies
  - @pgflow/core@0.1.6

## 0.1.5

### Patch Changes

- 5820e7a: Bump version for tests
- Updated dependencies [5820e7a]
  - @pgflow/core@0.1.5

## 0.1.4

### Patch Changes

- 9348751: Fix .ts being invalid in npm package
  - @pgflow/core@0.1.4

## 0.1.3

### Patch Changes

- 5538709: Fixes missing deno typescript script
  - @pgflow/core@0.1.3

## 0.1.2

### Patch Changes

- e3863f6: Implement a compile command in pgflow cli
  - @pgflow/core@0.1.2

## 0.1.1

### Patch Changes

- @pgflow/core@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies [7c40238]
  - @pgflow/core@0.1.0

## 0.0.23

### Patch Changes

- 7eddeec: Fix trailing comma in updateConfigToml
  - @pgflow/core@0.0.23

## 0.0.22

### Patch Changes

- c855aa0: Fix the changesets publish option
  - @pgflow/core@0.0.22

## 0.0.21

### Patch Changes

- 0e245fd: This is just a test
  - @pgflow/core@0.0.21

## 0.0.20

### Patch Changes

- Bupm
  - @pgflow/core@0.0.20

## 0.0.19

### Patch Changes

- 042bc64: Move migrations to pkgs/core
- Updated dependencies [042bc64]
  - @pgflow/core@0.0.19

## 0.0.18

### Patch Changes

- 53abf4a: Fix pnpm issues with linking to dist/

## 0.0.17

### Patch Changes

- 4a5b13b: Hopefully fixed
- c976d51: Fix postinstall script

## 0.0.16

### Patch Changes

- 590b36e: Update paths

## 0.0.15

### Patch Changes

- c734379: Fix the bin path

## 0.0.14

### Patch Changes

- 1ce5c57: Update bin settings for cli

## 0.0.13

### Patch Changes

- c34f349: Fix the missing executable bit and "files" setting in package.json

## 0.0.12

### Patch Changes

- 445d494: Fix the release pipeline

## 0.0.11

### Patch Changes

- 81e19d2: Pre-alpha release of CLI tool

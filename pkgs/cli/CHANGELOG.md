# pgflow

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

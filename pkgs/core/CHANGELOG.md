# @pgflow/core

## 0.2.5

### Patch Changes

- @pgflow/dsl@0.2.5

## 0.2.4

### Patch Changes

- 2f13e8b: Fix `poll_for_tasks` latency

  The previous implementation were calling `read_with_poll` in same statement
  as the `SELECT FROM step_tasks`, which resulted in new tasks that were inserted
  after the `read_with_poll` started were not discovered as those were not visible
  in the statement.

  Now `poll_for_tasks` is split to separate statements so step tasks created
  during the `poll_for_tasks` will be immediately picked up.

  - @pgflow/dsl@0.2.4

## 0.2.3

### Patch Changes

- @pgflow/dsl@0.2.3

## 0.2.2

### Patch Changes

- @pgflow/dsl@0.2.2

## 0.2.1

### Patch Changes

- d553c07: Fix critical migration error that prevented installing if PGMQ was installed previously
- Updated dependencies [3f3174e]
  - @pgflow/dsl@0.2.1

## 0.2.0

### Patch Changes

- @pgflow/dsl@0.2.0

## 0.1.23

### Patch Changes

- @pgflow/dsl@0.1.23

## 0.1.22

### Patch Changes

- Updated dependencies [8f6eb3d]
  - @pgflow/dsl@0.1.22

## 0.1.21

### Patch Changes

- ea1ce78: Make visibilityTimeout the last option to pollForTasks so it can be skipped
  - @pgflow/dsl@0.1.21

## 0.1.20

### Patch Changes

- 09e3210: Change name of initial migration :-(
- 985176e: Add step_index to steps and various status timestamps to runtime tables
  - @pgflow/dsl@0.1.20

## 0.1.19

### Patch Changes

- a10b442: Add minimum set of indexes
- efbd108: Convert migrations to declarative schemas and generate initial migration
  - @pgflow/dsl@0.1.19

## 0.1.18

### Patch Changes

- 3a7e132: Do not build edge-worker for npm
- Updated dependencies [3a7e132]
  - @pgflow/dsl@0.1.18

## 0.1.17

### Patch Changes

- d215ed2: Trigger version change
- Updated dependencies [d215ed2]
  - @pgflow/dsl@0.1.17

## 0.1.16

### Patch Changes

- cc7c431: Test release to verify combined publishing of both npm and jsr packages
- Updated dependencies [cc7c431]
  - @pgflow/dsl@0.1.16

## 0.1.15

### Patch Changes

- ce34a2c: Update release pipeline to publish to jsr
- Updated dependencies [ce34a2c]
  - @pgflow/dsl@0.1.15

## 0.1.14

### Patch Changes

- @pgflow/dsl@0.1.14

## 0.1.13

### Patch Changes

- @pgflow/dsl@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies [7b1328e]
  - @pgflow/dsl@0.1.12

## 0.1.11

### Patch Changes

- @pgflow/dsl@0.1.11

## 0.1.10

### Patch Changes

- bafe767: Fix deno/ folder for cli being missing
- Updated dependencies [bafe767]
  - @pgflow/dsl@0.1.10

## 0.1.9

### Patch Changes

- 1a30c6c: Make sure to tag and push tags
- Updated dependencies [1a30c6c]
  - @pgflow/dsl@0.1.9

## 0.1.8

### Patch Changes

- 05f5bd8: Update release script
- Updated dependencies [05f5bd8]
  - @pgflow/dsl@0.1.8

## 0.1.7

### Patch Changes

- summary
  - @pgflow/dsl@0.1.7

## 0.1.6

### Patch Changes

- Test release to verify problem with bumping edge-worker
- Updated dependencies
  - @pgflow/dsl@0.1.6

## 0.1.5

### Patch Changes

- 5820e7a: Bump version for tests
- Updated dependencies [5820e7a]
  - @pgflow/dsl@0.1.5

## 0.1.4

### Patch Changes

- @pgflow/dsl@0.1.4

## 0.1.3

### Patch Changes

- @pgflow/dsl@0.1.3

## 0.1.2

### Patch Changes

- @pgflow/dsl@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [b362364]
  - @pgflow/dsl@0.1.1

## 0.1.0

### Minor Changes

- 7c40238: fix migration files to not set `search_path`

### Patch Changes

- @pgflow/dsl@0.1.0

## 0.0.23

### Patch Changes

- @pgflow/dsl@0.0.23

## 0.0.22

### Patch Changes

- @pgflow/dsl@0.0.22

## 0.0.21

### Patch Changes

- @pgflow/dsl@0.0.21

## 0.0.20

### Patch Changes

- @pgflow/dsl@0.0.20

## 0.0.19

### Patch Changes

- 042bc64: Move migrations to pkgs/core
  - @pgflow/dsl@0.0.19

## 0.0.18

### Patch Changes

- 53abf4a: Fix pnpm issues with linking to dist/
- Updated dependencies [53abf4a]
  - @pgflow/dsl@0.0.18

## 0.0.17

### Patch Changes

- @pgflow/dsl@0.0.17

## 0.0.16

### Patch Changes

- @pgflow/dsl@0.0.16

## 0.0.15

### Patch Changes

- @pgflow/dsl@0.0.15

## 0.0.14

### Patch Changes

- @pgflow/dsl@0.0.14

## 0.0.13

### Patch Changes

- @pgflow/dsl@0.0.13

## 0.0.12

### Patch Changes

- @pgflow/dsl@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [17937e3]
  - @pgflow/dsl@0.0.11

## 0.0.10

### Patch Changes

- @pgflow/dsl@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [70d3f2d]
  - @pgflow/dsl@0.0.9

## 0.0.8

### Patch Changes

- @pgflow/dsl@0.0.8

## 0.0.7

### Patch Changes

- 7c83db9: Add release-related options to package.json files
- Updated dependencies [7c83db9]
  - @pgflow/dsl@0.0.7

## 0.0.6

### Patch Changes

- @pgflow/dsl@0.0.6

## 0.0.5

### Patch Changes

- 196f7d8: Test patch bump
- Updated dependencies [b4b0809]
  - @pgflow/dsl@0.0.5

# @pgflow/website

## 0.5.1

## 0.5.0

## 0.4.3

## 0.4.2

## 0.4.1

## 0.4.0

## 0.3.1

## 0.3.0

### Minor Changes

- c3653fa: Replace single-phase polling with two-phase approach to eliminate race conditions

  **Breaking Change**: The `poll_for_tasks` function is now deprecated and returns an empty set. Edge workers must be updated to use the new two-phase polling mechanism.

  **What Changed:**

  - Added new "started" status for step_tasks with `started_at` timestamp and `last_worker_id` tracking
  - Introduced `start_tasks` function for the second phase of task processing
  - Edge worker now uses two-phase approach: first `read_with_poll` to get messages, then `start_tasks` to process them
  - This eliminates race conditions where tasks might not be visible when processing messages

  **Migration Instructions:**

  1. Run `npx pgflow install` to apply database migrations and update dependencies
  2. Redeploy your edge workers - they will automatically use the new polling mechanism
  3. Old workers will continue running but won't process any tasks (safe degradation)

  **Why This Change:**
  The previous `poll_for_tasks` had subtle race conditions on slower systems where messages could be read but matching step_tasks weren't visible in the same transaction, leading to lost work. The new two-phase approach provides stronger guarantees and better observability.

## 0.2.6

## 0.2.5

## 0.2.4

## 0.2.3

### Patch Changes

- b0cd6bc: Update visibilityTimeout default value to 10s for queue-based worker

## 0.2.2

## 0.2.1

## 0.2.0

## 0.1.23

### Patch Changes

- 57aece4: Add pgflow landing page and docs

## 0.1.22

## 0.1.21

## 0.1.20

## 0.1.19

### Patch Changes

- efbd108: Convert migrations to declarative schemas and generate initial migration

## 0.1.18

### Patch Changes

- 3a7e132: Do not build edge-worker for npm

## 0.1.17

### Patch Changes

- d215ed2: Trigger version change

## 0.1.16

### Patch Changes

- cc7c431: Test release to verify combined publishing of both npm and jsr packages

## 0.1.15

### Patch Changes

- ce34a2c: Update release pipeline to publish to jsr

## 0.1.14

## 0.1.13

## 0.1.12

## 0.1.11

## 0.1.10

### Patch Changes

- bafe767: Fix deno/ folder for cli being missing

## 0.1.9

### Patch Changes

- 1a30c6c: Make sure to tag and push tags

## 0.1.8

### Patch Changes

- 05f5bd8: Update release script

## 0.1.7

## 0.1.6

### Patch Changes

- Test release to verify problem with bumping edge-worker

## 0.1.5

### Patch Changes

- 5820e7a: Bump version for tests

## 0.1.4

## 0.1.3

## 0.1.2

## 0.1.1

## 0.1.0

## 0.0.23

## 0.0.22

## 0.0.21

## 0.0.20

## 0.0.19

## 0.0.18

### Patch Changes

- 53abf4a: Fix pnpm issues with linking to dist/

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

## 0.0.10

## 0.0.9

## 0.0.8

## 0.0.7

### Patch Changes

- 7c83db9: Add release-related options to package.json files

## 0.0.6

### Patch Changes

- 9dd4676: Update package.json configuration

## 0.0.5

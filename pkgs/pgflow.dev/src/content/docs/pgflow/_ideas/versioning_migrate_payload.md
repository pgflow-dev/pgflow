---
title: "Versioning: migrate payload"
draft: true
---

We can show users how to implement a "payload migration function" that translates run payloads from previous versions to the new version.

#### Idempotent Handlers

Since handlers are idempotent (they can be run multiple times without changing the result beyond the initial application), we can safely retry operations.

#### Migration Function

Users provide a function that transforms the run payload from the old version to the new version.

#### Restarting Runs

Unfinished runs from the previous version are canceled. New runs are started using the migrated payloads.

### How it would work?

1. Define a Migration Function:

   Users write a function that accepts a payload from the old version and returns a payload suitable for the new version.

   Example:

   ```typescript
   function migratePayload(oldPayload: OldPayloadType): NewPayloadType {
     // Transform oldPayload to newPayload
     return newPayload;
   }
   ```

2. Cancel Unfinished Runs:

   Identify all runs associated with the old workflow version that are not completed.
   Mark these runs as canceled in the database.

3. Create New Runs with Migrated Payloads:

   For each canceled run, apply the migration function to the payload.
   Start a new run using the new workflow version and the migrated payload.

4. Update the System to Support Migrations:

   Migration Registration: Provide a way for users to register migration functions when deploying a new workflow version.
   Automated Process: Implement a utility that automates the cancellation and restarting of runs with migrated payloads.

# Feature Plan: Disable Worker Auto-Respawning (Minimal MVP)

## Overview

Add a simple environment variable to disable the automatic respawning of Edge Workers when they shut down. This is a minimal, temporary solution that can be improved later based on user feedback.

## Implementation (Super Simple)

### 1. Code Change

**File:** `pkgs/edge-worker/src/platform/SupabasePlatformAdapter.ts`

In the `setupShutdownHandler()` method, check for env var:

```typescript
private setupShutdownHandler(): void {
  globalThis.onbeforeunload = async () => {
    this.logger.debug('Shutting down...');

    // Check if auto-respawn is disabled via env var
    const disableAutoRespawn = this.validatedEnv.EDGE_WORKER_DISABLE_AUTO_RESPAWN === 'true';
    
    if (this.worker && !disableAutoRespawn) {
      await this.spawnNewEdgeFunction();
    } else if (this.worker && disableAutoRespawn) {
      this.logger.debug('Auto-respawn disabled via EDGE_WORKER_DISABLE_AUTO_RESPAWN');
    }

    await this.stopWorker();
  };
}
```

That's it for the code change! One if statement.

### 2. Documentation

**Create File:** `pkgs/website/src/content/docs/how-to/disable-worker-auto-respawn.mdx`

```markdown
---
title: Disable Worker Auto-Respawn
description: How to disable automatic worker respawning in Supabase Edge Functions
sidebar:
  order: 100
---

import { Aside } from "@astrojs/starlight/components";

<Aside type="caution" title="Temporary Feature">
This is a temporary solution using environment variables. In future versions, this may be replaced with a proper configuration option.
</Aside>

By default, pgflow Edge Workers automatically spawn a new instance when shutting down to ensure continuous processing. You can disable this behavior if you're using external orchestration like pg_cron.

## Disabling Auto-Respawn

Set the following environment variable in your Edge Function:

```bash
EDGE_WORKER_DISABLE_AUTO_RESPAWN=true
```

### In Supabase Dashboard

1. Go to your project's Edge Functions settings
2. Find your worker function
3. Add the environment variable:
   - Key: `EDGE_WORKER_DISABLE_AUTO_RESPAWN`
   - Value: `true`

### In .env.local

For local development:

```bash
EDGE_WORKER_DISABLE_AUTO_RESPAWN=true
```

## When to Use This

Disable auto-respawn when:

- You're using pg_cron to schedule worker restarts
- You want manual control over worker lifecycle
- You're debugging shutdown behavior
- You need to prevent duplicate workers

## Example with pg_cron

If you're using pg_cron to restart workers periodically:

```sql
-- Schedule worker restart every hour
SELECT cron.schedule(
  'restart-edge-worker',
  '0 * * * *',  -- Every hour
  $$
  -- Your restart logic here
  $$
);
```

With auto-respawn disabled, only pg_cron controls when new workers start.

<Aside type="note">
Without auto-respawn, ensure you have another mechanism (like pg_cron) to restart workers, otherwise processing will stop when the worker shuts down.
</Aside>
```

### 3. Testing (Optional - Only if Easy)

If testing is straightforward, create a simple test:

**File:** `pkgs/edge-worker/tests/unit/autoRespawn.test.ts`

```typescript
describe('Auto-respawn environment variable', () => {
  it('should respect EDGE_WORKER_DISABLE_AUTO_RESPAWN env var', () => {
    // Mock env var
    // Verify spawnNewEdgeFunction is not called
  });
});
```

## Implementation Checklist

- [ ] Add env var check to SupabasePlatformAdapter.ts (~5 lines)
- [ ] Create how-to documentation page
- [ ] (Optional) Add simple test if easy

## Total Effort: ~30 minutes

This minimal approach:
- Solves the immediate need
- Requires minimal code changes (5-10 lines)
- Easy to remove/replace later
- No API changes
- No breaking changes
- Clear documentation about temporary nature
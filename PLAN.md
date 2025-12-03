# Plan: Unified Connection Configuration for EdgeWorker

## Goal
Fix connection configuration to support all user scenarios with a clean, safe approach.

## Issues Addressed
- **#469**: `connectionString` config ignored - FIXED
- **#424**: Want simpler local dev - FIXED (hardcoded local URL)
- **Discussion #280**: Preview branch custom URLs - DOCUMENTED
- **SSL support**: Custom postgres options via `config.sql` - FIXED

## Connection Priority Chain

```
1. config.sql               → Full control (SSL, custom options)
2. config.connectionString  → Custom URL string
3. EDGE_WORKER_DB_URL       → Env var (works in local too!)
4. Local fallback           → Docker pooler (zero-config local dev)
5. (nothing)                → Error: "No connection available"
```

**Key:** Explicit config always wins. Local auto-detection is a **fallback**, not a priority.

**Note:** No `SUPABASE_DB_URL` fallback - fail hard if nothing configured. Preview branch pattern documented separately.

## Usage Examples

```typescript
// Local dev - just works, no config needed!
await EdgeWorker.start(MyFlow);

// Production - env var (most common)
// Set EDGE_WORKER_DB_URL=postgresql://... as secret
await EdgeWorker.start(MyFlow);

// Preview branches - explicit fallback pattern (documented)
await EdgeWorker.start(MyFlow, {
  connectionString: Deno.env.get('EDGE_WORKER_DB_URL')
    || Deno.env.get('SUPABASE_DB_URL'),
});

// SSL support - full control
const sql = postgres(url, {
  prepare: false,
  ssl: { ca, rejectUnauthorized: true },
});
await EdgeWorker.start(MyFlow, { sql });
```

---

## Phase 1: Local Detection Infrastructure

> **IMPORTANT:** Match the `worker-compilation` branch implementation exactly to minimize merge conflicts when rebasing.

### Step 1.1: Create localDetection.ts

**File:** `pkgs/edge-worker/src/shared/localDetection.ts` (NEW)

```typescript
export const KNOWN_LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const KNOWN_LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Checks if the provided environment indicates local Supabase.
 * Use when you have access to an env record (e.g., from PlatformAdapter).
 */
export function isLocalSupabaseEnv(env: Record<string, string | undefined>): boolean {
  const anonKey = env['SUPABASE_ANON_KEY'];
  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];
  return anonKey === KNOWN_LOCAL_ANON_KEY ||
         serviceRoleKey === KNOWN_LOCAL_SERVICE_ROLE_KEY;
}

export function isLocalSupabase(): boolean {
  return isLocalSupabaseEnv(Deno.env.toObject());
}
```

**Why this approach:** Local Supabase always uses these known demo keys. Checking keys is more reliable than checking for `SB_EXECUTION_ID` absence.

---

## Phase 2: Core Connection Logic

### Step 2.1: Remove `Omit<..., 'sql'>` from EdgeWorker.start() overloads

**File:** `pkgs/edge-worker/src/EdgeWorker.ts`

Remove `Omit<..., 'sql'>` from lines 56-59, 67-70, and 80-86 to allow `sql` in config.

### Step 2.2: Update createAdapter to accept options

**File:** `pkgs/edge-worker/src/platform/createAdapter.ts`

```typescript
interface AdapterOptions {
  sql?: Sql;
  connectionString?: string;
}

export function createAdapter(options?: AdapterOptions): PlatformAdapter<SupabaseResources> {
  if (isDenoEnvironment()) {
    return new SupabasePlatformAdapter(options);
  }
  throw new Error('Unsupported environment');
}
```

### Step 2.3: Update SupabasePlatformAdapter with priority chain

**File:** `pkgs/edge-worker/src/platform/SupabasePlatformAdapter.ts`

Add import (match exact path for conflict-free rebase):
```typescript
import { isLocalSupabaseEnv } from '../shared/localDetection.js';
```

Update constructor:
```typescript
// Hardcoded local pooler URL
const LOCAL_POOLER_URL = 'postgresql://postgres.pooler-dev:postgres@pooler:6543/postgres';

constructor(options?: { sql?: Sql; connectionString?: string }) {
  const env = Deno.env.toObject();

  // Detect local environment using known Supabase demo keys
  const isLocal = isLocalSupabaseEnv(env);

  // Priority: config.sql → config.connectionString → EDGE_WORKER_DB_URL → local fallback → error
  let connectionString: string | undefined;

  if (isLocal && !options?.sql && !options?.connectionString && !env.EDGE_WORKER_DB_URL) {
    // Zero-config local dev: use docker pooler when nothing else is configured
    connectionString = LOCAL_POOLER_URL;
  } else {
    connectionString = options?.connectionString || env.EDGE_WORKER_DB_URL;
  }

  if (!options?.sql && !connectionString) {
    throw new Error(
      'No database connection available. Provide one of: ' +
      'config.sql, config.connectionString, or EDGE_WORKER_DB_URL environment variable.'
    );
  }

  this._platformResources = {
    sql: options?.sql ?? postgres(connectionString!, {
      prepare: false,
      max: 10,
    }),
    supabase: createServiceSupabaseClient(env)
  };
}
```

Add getter (place after `platformResources` getter to match worker-compilation):
```typescript
/**
 * Whether running in a local/development environment.
 */
get isLocalEnvironment(): boolean {
  return isLocalSupabaseEnv(this.validatedEnv);
}
```

### Step 2.4: Relax assertSupabaseEnv validation

**File:** `pkgs/edge-worker/src/platform/SupabasePlatformAdapter.ts`

Remove `EDGE_WORKER_DB_URL` from required env vars - it's now optional (handled in constructor).

---

## Phase 3: Integration

### Step 3.1: Pass config to createAdapter in EdgeWorker

**File:** `pkgs/edge-worker/src/EdgeWorker.ts`

```typescript
// In startFlowWorker and startQueueWorker:
const platform = await createAdapter({
  sql: config.sql,
  connectionString: config.connectionString,
});
```

### Step 3.2: Unify connections - worker uses platform SQL

**File:** `pkgs/edge-worker/src/EdgeWorker.ts`

```typescript
const workerConfig = {
  ...config,
  sql: platform.platformResources.sql,  // Single connection everywhere
};
```

---

## Phase 4: Cleanup

### Step 4.1: Update connectionString getter

**File:** `pkgs/edge-worker/src/platform/SupabasePlatformAdapter.ts`

Return `undefined` if `config.sql` was provided (no URL available). Store a flag in constructor to track this.

### Step 4.2: Update CLI - remove EDGE_WORKER_DB_URL from install

**File:** `pkgs/cli/src/commands/install/update-env-file.ts`

Remove `EDGE_WORKER_DB_URL` from env vars. Only create `EDGE_WORKER_LOG_LEVEL`.

```typescript
const envVars = {
  EDGE_WORKER_LOG_LEVEL: 'info',
};
```

---

## Phase 5: Tests

### Step 5.1: Update existing tests

**File:** `pkgs/edge-worker/tests/integration/_helpers.ts`

Make `EDGE_WORKER_DB_URL` optional in `DEFAULT_TEST_SUPABASE_ENV`. Tests pass `sql` directly so they should continue working.

### Step 5.2: Add new tests

- Priority chain tests for SupabasePlatformAdapter
- Local environment detection tests (using known keys)
- Error case tests ("No connection available")

---

## Files Summary

### Files to Create
| File | Purpose |
|------|---------|
| `pkgs/edge-worker/src/shared/localDetection.ts` | Local environment detection (copy from worker-compilation) |

### Files to Modify
| File | Changes |
|------|---------|
| `pkgs/edge-worker/src/EdgeWorker.ts` | Remove Omit, pass options to createAdapter, unify connections |
| `pkgs/edge-worker/src/platform/createAdapter.ts` | Accept options object |
| `pkgs/edge-worker/src/platform/SupabasePlatformAdapter.ts` | Priority chain, local detection import, isLocalEnvironment getter, relaxed validation |
| `pkgs/cli/src/commands/install/update-env-file.ts` | Remove EDGE_WORKER_DB_URL |
| `pkgs/edge-worker/tests/integration/_helpers.ts` | Make EDGE_WORKER_DB_URL optional |

---

## Documentation Updates

### Move and expand existing doc
- **Move:** `/deploy/connection-string.mdx` → `/deploy/supabase/connection-string.mdx`
- Add redirect from old path

### New docs in `/deploy/supabase/`

```
/deploy/supabase/
├── deploy-first-flow.mdx      (existing, order: 10)
├── database-connection.mdx    (NEW, order: 20)
│   - Overview of connection options
│   - How to get pooler URL from Supabase dashboard
│   - Setting EDGE_WORKER_DB_URL secret
│   - Link to connection-string.mdx for encoding
├── connection-string.mdx      (MOVED, order: 25)
│   - URL encoding for special characters (existing content)
├── preview-branches.mdx       (NEW, order: 30)
│   - Why preview branches need special handling
│   - The explicit fallback pattern
│   - Why direct connection is risky
├── database-ssl.mdx           (NEW, order: 35)
│   - When SSL is needed
│   - Passing config.sql with SSL options
│   - Example with Supabase CA cert
├── troubleshooting.mdx        (NEW, order: 40)
│   - Common connection errors
│   - "No connection available" - what to check
│   - Connection pool exhaustion
│   - SSL certificate issues
├── keep-workers-running.mdx   (existing, order: 50)
```

### Update existing docs
- **`/get-started/flows/run-flow.mdx`** - Add aside noting connection is auto-detected locally

---

## Issues Closed by This Change

- Close #469 with "Fixed: connectionString config now works"
- Close #424 with "Fixed: Local dev uses hardcoded pooler URL, no env var needed"
- Reference Discussion #280 in preview-branches.mdx

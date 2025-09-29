# Auto-Compilation: Simplified Flow Development

## 🚀 Local Development - No Manual Steps

### 1. Start Edge Runtime

```bash
supabase functions serve
```

### 2. Start Worker (Triggers Auto-Compilation)

```bash
curl http://localhost:54321/functions/v1/my-worker
```

- Worker detects local environment ([see how](#environment-detection))
- Auto-creates flow in database
- ✅ Ready to process tasks immediately

### 3. Edit Flow Code

Make changes to your flow definition file.

### 4. Restart Worker (After Code Changes)

```bash
# Kill `functions serve` (Ctrl+C), then restart
supabase functions serve
```

```bash
# Start worker with fresh code
curl http://localhost:54321/functions/v1/my-worker
```

- Worker auto-updates flow definition
- ✅ Ready to test immediately

**What happens automatically:**

- Worker detects local environment
- Compares flow code with database definition
- Updates database to match your code
- Preserves test data when only runtime options change
- Removes old definition, data, and runs when flow structure changes - new version recreated automatically

**No `pgflow compile` commands needed in development! 🎉**

## 🔍 Environment Detection

Workers automatically detect whether they're running locally or in production.

```typescript
// Check for Supabase-specific environment variables
const isLocalDev = !Boolean(
  Deno.env.get('DENO_DEPLOYMENT_ID') ||
    Deno.env.get('SB_REGION') ||
    Deno.env.get('SB_EXECUTION_ID')
);
```

**How it works:**

- These environment variables are automatically set by Supabase on hosted deployments
- When running `supabase functions serve` locally, these variables are absent
- Optional: Can also verify hostname in request headers (e.g., `localhost:54321`) for additional safety

**Result:**

- **Local:** Auto-compilation enabled - worker creates/updates flows automatically
- **Production:** Verification mode - behavior depends on deployment approach (see below)

## 🏭 Production Deployment

Two production approaches are planned:

### Option A: Auto-Compilation (Fastest) ⚡

Worker auto-creates flows in production (no manual migrations needed).

#### 1. Deploy Worker Code

```bash
supabase functions deploy my-worker
```

#### 2. First HTTP Request (Auto-Compilation)

```bash
curl https://your-project.supabase.co/functions/v1/my-worker
```

- Worker auto-creates flow in production database
- ✅ Ready to handle requests immediately
- ❌ If flow exists but mismatches: fails with error (update required)
- ℹ️ Flow conflicts handled as described in [Edge Cases](#flow-definition-conflicts)

**Benefits:**

- ✅ Zero deployment steps
- ✅ Always in sync with code
- ✅ No forgotten migrations

### Option B: Explicit Verification (Safest) 🛡️

Worker enforces migration-first workflow (flows must exist before deployment).

#### 1. Generate Migration Locally

```bash
pgflow compile flows/my-flow.ts
```

- Creates: `supabase/migrations/20241201120000_create_my_flow.sql`
- Worker inferred: `my-flow-worker` (basename + "-worker")

#### 2. Deploy Migration

```bash
supabase migrations up
```

#### 3. Enable Strict Mode

Set environment variable to enforce explicit migrations:

```bash
# In production environment config
PGFLOW_REQUIRE_MIGRATIONS=true
```

**Strict mode behavior:**

- ❌ Worker fails if flow doesn't exist (migration required first)
- ❌ Worker fails if flow structure mismatches
- ✅ Worker starts only if flow exists and matches

#### 4. Deploy Worker Code

```bash
supabase functions deploy my-worker
```

- Worker verifies flow exists in database
- Worker verifies flow matches code definition
- Starts successfully if both checks pass (✅)
- Fails fast with clear error if flow missing or mismatched (❌)

**Benefits:**

- ✅ Explicit control over schema changes
- ✅ Clear deployment audit trail
- ✅ Fail-fast protection against mistakes
- ✅ Enforces migration-first workflow

## ⚙️ Manual Compilation Command

Required when using **Option B (Explicit Verification)** - generates migration file for explicit deployment control.

### Basic Usage

```bash
pgflow compile flows/my-flow.ts
```

- Infers worker: `my-flow-worker` (basename + "-worker")
- Checks staleness: compares file mtime with worker startup time
- Returns compiled SQL if worker is fresh

### Custom Worker Name

```bash
pgflow compile flows/my-flow.ts --worker custom-worker
```

- Use when worker doesn't follow naming convention
- Useful for horizontal scaling or specialized workers

**Success output:** ✅

```
✓ Compiled successfully: my_flow → SQL migration ready
```

**If worker needs restart:** ❌

```
Error: Worker code changed since startup
Action: Restart worker and retry
```

## ⚠️ Edge Cases & Solutions

### Multiple Worker Instances (Horizontal Scaling) ✅

```bash
# All instances handle the same flow
my-flow-worker-1, my-flow-worker-2, my-flow-worker-3
```

```bash
# Any instance can compile (specify which one explicitly)
pgflow compile flows/my-flow.ts --worker my-flow-worker-1
pgflow compile flows/my-flow.ts --worker my-flow-worker-2
# Or use default inference (hits whichever instance responds)
pgflow compile flows/my-flow.ts
```

- ✅ First instance to start creates the flow
- ✅ Others detect existing flow and continue

### Stale Worker (Code Changes) ❌

**Problem:** Worker started before code changes.

#### Solution: Restart Worker

```bash
# Kill `functions serve` (Ctrl+C), then restart
supabase functions serve
```

```bash
# Start worker with fresh code
curl http://localhost:54321/functions/v1/my-worker
```

**Detection:** CLI compares file modification time with worker startup time.

### Flow Definition Conflicts

**Local development:** ✅

- ✅ Automatically updates database to match code
- ✅ Old definition, data, and runs removed
- ✅ New version recreated automatically

**Production (Option B):** ❌

```
Error: Flow 'my_flow' structure mismatch
- Step 'process' dependencies changed: ['fetch'] → ['fetch', 'validate']
- New step 'validate' added
Action: Create new flow version (my_flow_v2) or update migration
```

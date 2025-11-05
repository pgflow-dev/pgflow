# Auto-Compilation: Simplified Flow Development

> **Implementation**: This feature is being built in two phases:
>
> - **Phase 1 (MVP)**: Core auto-compilation with conservative behavior
> - **Phase 2 (Enhancement)**: Smart updates that preserve data when possible

---

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
- **Phase 1**: Always drops and recreates (fresh state guaranteed)
- **Phase 2**: Preserves test data when only runtime options change

**No `pgflow compile` commands needed in development! 🎉**

---

## 🔍 Environment Detection

Workers automatically detect whether they're running locally or in production.

```typescript
// Check for Supabase-specific environment variables
const isLocal = !Boolean(
  Deno.env.get('DENO_DEPLOYMENT_ID') || Deno.env.get('SB_REGION')
);
```

**How it works:**

- These environment variables are automatically set by Supabase on hosted deployments
- When running `supabase functions serve` locally, these variables are absent
- Additional DB URL validation warns about unexpected configurations

**Result:**

- **Local**: Auto-compilation enabled - worker creates/updates flows automatically
- **Production**: Conservative mode - requires explicit migrations for existing flows

---

## 🏭 Production Deployment

### Phase 1: Conservative Approach

**Behavior**:

- **New flows**: Auto-created on first deployment ✅
- **Existing flows**: Worker fails, requires migration ❌

#### Deploy New Flow

```bash
# 1. Deploy worker code
supabase functions deploy my-worker

# 2. First request auto-creates flow
curl https://your-project.supabase.co/functions/v1/my-worker
# ✅ Ready to handle requests
```

#### Update Existing Flow

```bash
# 1. Generate migration
pgflow compile flows/my-flow.ts

# 2. Deploy migration
supabase db push

# 3. Deploy worker code
supabase functions deploy my-worker
# ✅ Worker verifies flow matches
```

**Phase 1 Benefits**:

- ✅ Explicit control over production changes
- ✅ Clear audit trail (migrations)
- ✅ Fail-fast protection
- ✅ Simple, predictable behavior

**Phase 1 Trade-off**:

- ⚠️ Even option-only changes require migration

---

### Phase 2: Smart Updates (Enhancement)

**Additional Behavior**:

- **Existing flows with matching structure**: Auto-updates runtime options ✅
- **Existing flows with structure changes**: Still requires migration ❌

#### Update Runtime Options (No Migration Needed!)

```bash
# 1. Change timeout/maxAttempts in code
# 2. Deploy worker
supabase functions deploy my-worker
# ✅ Options updated automatically (no migration!)
```

#### Update Flow Structure (Migration Required)

```bash
# 1. Add new step or change dependencies
# 2. Generate migration
pgflow compile flows/my-flow.ts

# 3. Deploy migration + worker
supabase db push
supabase functions deploy my-worker
```

**Phase 2 Benefits**:

- ✅ Faster deploys for option changes
- ✅ Still safe (structure changes require migration)
- ✅ Backward compatible with Phase 1

**Phase 2 Addition: Strict Mode** _(Optional)_

```bash
# Require migrations even for new flows
PGFLOW_REQUIRE_MIGRATIONS=true
```

---

## ⚙️ Manual Compilation Command

Generate migration files for explicit deployment control.

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
✓ Created: supabase/migrations/20250108120000_create_my_flow.sql
```

**If worker needs restart:** ❌

```
Error: Worker code changed since startup
Action: Restart worker and retry
```

---

## ⚠️ Edge Cases & Solutions

### Multiple Worker Instances (Horizontal Scaling) ✅

```bash
# All instances handle the same flow
my-flow-worker-1, my-flow-worker-2, my-flow-worker-3
```

- ✅ **Phase 1**: First instance creates, others fail gracefully and retry
- ✅ **Phase 2**: First instance creates, others detect and continue
- ✅ Advisory locks prevent race conditions

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

---

### Flow Definition Changes

#### Local Development ✅

**Phase 1**:

- ✅ Always drops and recreates
- ✅ Guaranteed fresh state
- ⚠️ Test data lost on every restart

**Phase 2**:

- ✅ Preserves test data when only options change
- ✅ Only drops when structure changes (new steps, changed dependencies)
- ✅ Better developer experience

---

#### Production Deployment

**Phase 1 - Any Change**:

```
Error: Flow 'my_flow' already exists
Action: Deploy migration first or use different slug
```

Must generate and deploy migration for any change.

**Phase 2 - Structure Change**:

```
Error: Flow 'my_flow' structure mismatch
- Step 'process' dependencies changed: ['fetch'] → ['fetch', 'validate']
- New step 'validate' added
Action: Deploy migration first (pgflow compile flows/my-flow.ts)
```

Structure changes still require migration (safe!).

**Phase 2 - Option Change**:

```
✓ Runtime options updated for flow 'my_flow'
- Step 'process': timeout 30s → 60s
```

Option changes work automatically (convenient!).

---

## 📋 Behavior Summary

### What Gets Auto-Compiled

| Change Type          | Local (Phase 1)  | Local (Phase 2)    | Production (Phase 1) | Production (Phase 2) |
| -------------------- | ---------------- | ------------------ | -------------------- | -------------------- |
| **New flow**         | ✅ Auto-create   | ✅ Auto-create     | ✅ Auto-create       | ✅ Auto-create       |
| **Runtime options**  | ✅ Drop+recreate | ✅ **Update only** | ❌ Require migration | ✅ **Update only**   |
| **Structure change** | ✅ Drop+recreate | ✅ Drop+recreate   | ❌ Require migration | ❌ Require migration |

**Key Insight**: Phase 2 adds smart updates that preserve data and allow option changes without migrations.

---

## 🎯 When to Use Each Phase

### Ship Phase 1 When:

- ✅ You want auto-compilation ASAP
- ✅ You're okay with explicit migrations in production
- ✅ You don't mind losing local test data on restarts
- ✅ You want simple, predictable behavior

### Upgrade to Phase 2 When:

- ✅ Phase 1 is stable in production
- ✅ You want better local dev experience (preserve test data)
- ✅ You want faster production deploys (option changes without migrations)
- ✅ You've validated Phase 1 works for your workflows

---

## 🔗 See Also

- **[PLAN_phase1.md](./PLAN_phase1.md)** - Detailed Phase 1 implementation plan
- **[PLAN_phase2.md](./PLAN_phase2.md)** - Detailed Phase 2 enhancement plan

# Auto-Compilation Implementation Plan - REVISED

## Executive Summary: Approach is Viable with Advisory Locks

**REVISED ASSESSMENT**: After thorough analysis, the auto-compilation approach is **viable and beneficial** when implemented with proper safeguards:

1. **Advisory locks solve major concurrency issues** (with careful consideration of potential blocking)
2. **Performance is not a concern** (sub-second operations, not 30+ seconds)
3. **Current CLI workflow is genuinely painful** and needs improvement
4. **Local dev + production verification** provides excellent compromise
5. **HTTP-based compilation** eliminates tooling complexity entirely
6. **"Schema modifications" are just data operations**, not DDL changes

## Key Implementation Decisions

**Simplified Architecture:**
- **1 Function = 1 Flow**: Each worker function runs exactly one flow
- **Flow file is primary argument**: `pgflow compile flows/my-flow.ts`
- **Worker name inferred or explicit**: Default: `<basename>-worker`, override with `--worker` flag
- **No runtime introspection needed**: CLI knows both flow file (explicit) and worker (inferred/explicit)

**Stale Worker Detection:**
- **Only viable approach**: Timestamp comparison (file mtime vs worker startup time)
- **Why**: Edge Functions cannot read their own source files - file hashing is impossible
- **Key limitation**: Multiple instances with staggered starts - requires restart coordination
- **See detailed edge case analysis below**

**Environment Detection:**
- **Primary**: Supabase environment variables (DENO_DEPLOYMENT_ID, SB_REGION, SB_EXECUTION_ID)
- **Secondary**: Hostname verification (localhost check for added safety)
- **Defense in depth**: Both checks recommended

**Production Deployment Policies:**
- **Multiple options presented**: Environment variable, database config, flow-level annotation, default behavior
- **Recommendation**: Default sensible behavior + optional env var override for strict mode
- **Not committed to specific env var name**: Open for implementation decision

**Advisory Locks:**
- **Essential for production**: Prevents race conditions with multiple workers
- **Requires careful consideration**: Potential blocking, timeout strategy, observability
- **Start simple, iterate**: Use advisory locks, monitor, adjust based on real-world behavior

## Core Decisions & Findings

### 1. Runtime Options Handling
**Decision**: Always code wins + clear warnings when overwriting manual changes.

**The Problem**:
Users manually tune via SQL, then redeploy code with different options → silently overwrites manual tuning.

**Solution**:
- Always update DB to match code definition on deployment
- Log informative warnings when overwriting manual changes
- Document clearly: "Runtime options should be changed in code, not SQL"

**Reasoning**:
- **Simple & predictable**: Developers know code always wins
- **Educational**: Teaches correct "code as source of truth" workflow
- **Traceable**: Changes tracked in source control, not hidden in SQL
- **MVP-aligned**: No complex conflict resolution logic needed

**Warning Example**:
```
[WARNING] Runtime options updated for 'analyze_website':
- Step 'process': timeout 90s → 60s (was manually changed 2024-01-15)
- Step 'fetch': max_attempts 5 → 3 (was manually changed 2024-01-12)

Source code is the source of truth. Update code instead of SQL.
```

### 2. Dependency Ordering for Comparison
**Decision**: Order dependencies alphabetically by `dep_slug`.

**Reasoning**:
- Dependency order doesn't affect DAG execution (all deps must complete regardless)
- Alphabetical ordering is deterministic and simple
- Alternative (ordering by `step_index` of dependencies) is more complex without benefit

### 3. Shape Comparison Strategy
**Decision**: Use shape comparison in both local and production, but with different responses.

**Reasoning**:
- If implementing shape comparison for production safety, marginal cost for local dev is small
- Provides better UX by preserving test data when only operational settings change
- Consistent logic across environments, different behaviors

**Local Dev Response**:
- Structural change → Wipe data + recreate flow
- Only runtime options changed → Update options + preserve data
- No changes → Continue with existing definition

**Production Response**:
- Structural change → Fail fast with detailed error
- Only runtime options changed → Update options + continue
- No changes → Continue with existing definition

### 4. Data Structure Design
**Decision**: Use existing Flow API with fingerprint comparison, no new abstractions needed.

**Flow Fingerprint Structure**:
```typescript
interface FlowFingerprint {
  slug: string;
  steps: StepFingerprint[];
}

interface StepFingerprint {
  slug: string;
  step_index: number;
  dependencies: string[]; // sorted alphabetically
  step_type: string;
  // Runtime options excluded - they're updatable
}
```

**Comparison Method**: Generate fingerprints from both DB state and Flow definition, compare for structural equality.

### 5. Production Deployment Strategy - REVISED
**Decision**: Local dev auto-compilation + production verification/optional auto-creation

**Environment-Specific Behavior**:
- **Local Dev**: Auto-compilation with advisory locks (huge productivity boost)
- **Production**: Verification-first, optional auto-creation for new flows

**Deployment Scenarios**:
- **New Flow**: Auto-create on first deployment (safe - no existing data)
- **Compatible Change** (runtime options only): Auto-update options
- **Breaking Change**: Create new version with different slug → auto-create v2
- **Shape Mismatch**: Fail fast with detailed instructions

**Production Auto-Compilation Options**:

Given that flow operations are just data (not schema), production auto-compilation is viable. Multiple implementation approaches to consider:

**Option 1: Environment Variable Flag**
```bash
PGFLOW_REQUIRE_MIGRATIONS=true  # or PGFLOW_STRICT_MODE=true
```
- Simple boolean flag
- Easy to set in deployment config
- Clear on/off switch

**Option 2: Database Configuration**
```sql
-- Store policy in database
INSERT INTO pgflow.settings (key, value)
VALUES ('auto_compilation_policy', 'strict');
-- Values: 'auto' | 'strict' | 'verify-only'
```
- Centralized configuration
- Can be changed without redeployment
- Survives across deployments

**Option 3: Flow-Level Annotation**
```typescript
const myFlow = Flow.define({
  slug: 'my_flow',
  productionPolicy: 'strict', // or 'auto'
  // ...
});
```
- Per-flow granularity
- Explicit in code
- Mixed policies possible (some flows strict, others auto)

**Option 4: Default Behavior Based on Environment**
```typescript
// No explicit config needed
// Local: Always auto-compile
// Production: Detect if flow exists
//   - New flow: Auto-create (safe)
//   - Existing flow match: Continue
//   - Existing flow mismatch: Fail
```
- Zero configuration
- Sensible defaults
- Fail-safe on conflicts

**Recommendation:** Start with Option 4 (default behavior) + Option 1 (env var override). This provides sensible defaults with explicit opt-in for stricter control when needed.

**Key Insight**: Flow operations are **data modifications** (INSERT INTO pgflow.flows/steps/deps), not schema changes (ALTER TABLE). Much safer than initially assessed.

### 5b. Multi-Worker Architecture Considerations
**Key Architectural Decision: 1 Function = 1 Flow**

**Horizontal Scaling** (Supported):
- Same flow definition, multiple worker instances
- Load balancing across instances
- Any instance can provide compilation
- Example: Deploy `analyze-website-worker` with 3 instances
- Advisory locks prevent race conditions during startup

**Multi-Queue Architecture** (Future Consideration):
- Specialized workers for different step types (CPU/IO/DB-optimized)
- Would require same flow across different workers
- Adds complexity: flow file discovery, synchronization
- Not part of initial implementation
- Current constraint: Each worker function runs exactly one flow

### 5a. HTTP-Based Compilation - Game Changer
**Revolutionary Approach**: Edge Functions can serve as compilation endpoints, eliminating local tooling complexity.

**How it Works**:
```bash
# Old approach (complex):
pgflow compile supabase/functions/_flows/analyze-website.ts  # Spawns Deno, manages import maps, etc.

# New approach (HTTP-based):
pgflow compile supabase/functions/_flows/analyze-website.ts
# → Infers worker: analyze-website-worker (basename + "-worker")
# → GET http://localhost:54321/functions/v1/analyze-website-worker/compile?check_after=<mtime>

# Explicit worker override:
pgflow compile supabase/functions/_flows/analyze-website.ts --worker custom-worker
# → GET http://localhost:54321/functions/v1/custom-worker/compile?check_after=<mtime>
```

**CLI Signature**:
```bash
pgflow compile <flow-file> [--worker <worker-name>]

# Examples (from repository root):
pgflow compile supabase/functions/_flows/my-flow.ts           # Infers: my-flow-worker
pgflow compile supabase/functions/_flows/supa-flow.ts         # Infers: supa-flow-worker
pgflow compile supabase/functions/_flows/my-flow.ts --worker prod-worker  # Explicit override
```

**Worker Inference Convention**:
- Strip `.ts` extension from flow file basename
- Append `-worker` suffix
- `supabase/functions/_flows/analyze-website.ts` → `analyze-website-worker`
- `supabase/functions/_flows/supa-flow.ts` → `supa-flow-worker`

**Repository Structure**:
```
project-root/
├── supabase/
│   ├── functions/
│   │   ├── _flows/
│   │   │   ├── my-flow.ts           # Flow definition
│   │   │   └── analyze-website.ts   # Flow definition
│   │   ├── my-flow-worker/          # Worker for my-flow
│   │   │   └── index.ts
│   │   └── analyze-website-worker/  # Worker for analyze-website
│   │       └── index.ts
│   └── migrations/
└── ...
```

**Architecture Flexibility**:
- **Horizontal scaling**: Multiple instances of same worker function
  - All instances run the same flow
  - Any instance can provide compilation
  - Example: Deploy `my-worker` with 3 instances for load balancing

**Benefits**:
- **No local Deno required**: CLI just makes HTTP request
- **No import map complexity**: Edge Function already has everything loaded
- **Authoritative source**: Runtime environment compiles its own definitions
- **CI/CD friendly**: Works from any machine with HTTP access
- **Horizontally scalable**: Any worker instance can provide compilation
- **Future-proof**: Supports multi-queue and custom worker architectures

**Stale Worker Protection: Timestamp-Based (Only Option)**

**Confirmed Constraint:** Edge Functions cannot read their own source files at runtime. File hashing is impossible. Timestamp comparison is the only viable approach.

**Implementation Architecture:**

```typescript
// CLI determines flow file path locally (via convention or config)
// Convention: my-worker → flows/my-worker.ts

const flowFile = determineFlowFile('my-worker'); // "flows/my-worker.ts"
const fileMtime = fs.statSync(flowFile).mtimeMs;

// Single request with staleness check
GET /functions/v1/my-worker/compile?check_after=${fileMtime}

// Worker response options:
// 1. Fresh - return compilation
Response 200: {
  sql: string[];      // Array of SQL statements from compileFlow()
  flow_slug: string;
}

// 2. Stale - worker started before file modification
Response 409: {
  error: "stale_worker",
  worker_start_time: 1704067200000,
  check_after: 1704067300000,
  message: "Worker started before flow file was modified"
}
```

**Why this is simpler:**
- Single HTTP request (not two)
- Worker has all info (its start_time, the check_after timestamp)
- CLI determines flow file path locally via convention
- No need to expose flow_file path from worker

**Flow File Discovery Convention:**

CLI needs to know which file to check mtime on. Options:

1. **Naming Convention (Simplest)**
   ```
   Worker name: my-worker
   Flow file: flows/my-worker.ts
   ```

2. **Configuration File**
   ```json
   // pgflow.json
   {
     "workers": {
       "my-worker": "flows/my-flow.ts"
     }
   }
   ```

3. **Package.json Convention**
   ```json
   {
     "pgflow": {
       "workers": {
         "my-worker": "./flows/my-flow.ts"
       }
     }
   }
   ```

**Recommendation:** Start with naming convention (Option 1), add config override if needed later.

**Edge Cases and Limitations:**

**1. Clock Skew (Minor Inconvenience)**
```
Issue: CLI uses local machine time, worker uses server time
Example:
- Dev machine clock: 12:05 (5 minutes fast)
- File modified: 12:05 dev time
- Worker started: 12:00 server time
- Result: False positive - thinks stale when fresh

Impact: Annoying false positive on first attempt
Resolution: Restart worker, retry immediately → succeeds
Severity: Very Low - short window, self-correcting on retry
Explanation: After restart, worker start time "catches up" to file time
```

**2. mtime Changes Without Content Changes**
```
When does this happen?
- Save file without actual changes in editor
- Touch command: `touch flows/my-flow.ts`
- File system sync/backup operations
- Git operations (checkout, rebase) that restore same content

Result: Worker flagged as stale despite identical content

Should we protect against this?
No - protecting would require content hashing (impossible in Edge Functions)

Impact: Requires unnecessary restart
Severity: Very Low - uncommon in normal workflow
Cost: Just restart worker, minimal inconvenience
Not worth complex workarounds
```

**3. Filesystem Timestamp Precision**
```
Issue: Some filesystems have 1-second precision
Example:
- Worker start: 12:00:00.500
- File modified: 12:00:00.999
- File mtime (1s precision): 12:00:00.000
- Comparison: 12:00:00 <= 12:00:00.500 → False negative

Impact: Might miss staleness in rare race condition
Severity: Very Low - requires modification within same second as startup
Consequence: Developer gets SQL for old definition, catches in review
Mitigation: Accept as extremely rare edge case
```

**4. Multiple Worker Instances - Not an Issue in Practice**
```
Theoretical concern: Horizontal scaling with staggered start times
Example:
- Deploy 3 instances of my-worker
- Instance 1 starts: 12:00
- Instance 2 starts: 12:05
- Instance 3 starts: 12:10
- File edited at: 12:03
- CLI hits instance 2 → returns start_time=12:05 → appears fresh!

Reality check:
- Local dev: `supabase functions serve` runs single instance
- Production compilation: Rare operation, not during active traffic
- If needed: Document "restart all instances before compile"

Conclusion: Not worth complex solutions (DB tracking, deployment timestamps)
           Simple approach sufficient for actual usage patterns
```

**5. Worker Hot Reload - Not Expected**
```
Question: Does Supabase Edge Runtime hot reload code without restart?

Analysis:
- Deno supports --watch flag for hot reload
- But Supabase Edge Runtime is custom runtime
- Hot reload would break module state/singletons
- Standard practice: Restart process on code change

Conclusion: Assume no hot reload
           Edge Functions restart on code change
           If observed in practice, document as known limitation
           Not worth designing around unlikely scenario
```

**What Happens if Staleness Check Fails?**
```
Scenario: Check incorrectly says "fresh" but worker is actually stale
Result: CLI gets SQL for old flow definition
Impact: Developer reviews generated SQL before applying
        Catches mismatch during review process
        Not catastrophic - SQL is visible artifact

Conclusion: Timestamp approach is "best effort" safety check
           Final safety is SQL review process
           Acceptable for this use case
```

**Required Worker Endpoint:**

Workers must expose a single compilation endpoint:

```typescript
GET /functions/v1/my-worker/compile?check_after=<timestamp>

// Success response (worker is fresh)
Response 200: {
  sql: string[];        // Array of SQL statements from compileFlow()
  flow_slug: string;    // Flow identifier
}

// Stale worker response
Response 409: {
  error: "stale_worker",
  worker_start_time: number,    // When this worker started
  check_after: number,          // Timestamp from request
  message: string               // Human-readable explanation
}
```

**Worker Implementation:**
```typescript
// Worker records start time at initialization
const workerStartTime = Date.now();

// Compilation endpoint handler
async function handleCompile(request: Request) {
  const url = new URL(request.url);
  const checkAfter = parseInt(url.searchParams.get('check_after') || '0');

  // Check staleness
  if (checkAfter > workerStartTime) {
    return new Response(JSON.stringify({
      error: 'stale_worker',
      worker_start_time: workerStartTime,
      check_after: checkAfter,
      message: 'Worker started before flow file was modified'
    }), { status: 409 });
  }

  // Compile using existing function
  const sql = compileFlow(myFlow);
  return new Response(JSON.stringify({
    sql,
    flow_slug: myFlow.slug
  }));
}
```

**User Experience**:
```bash
$ pgflow compile supabase/functions/_flows/my-flow.ts

# CLI internally:
# 1. Get flow file mtime: fs.statSync('supabase/functions/_flows/my-flow.ts').mtimeMs
# 2. Infer worker name: my-flow-worker (basename + "-worker")
# 3. GET /my-flow-worker/compile?check_after=${mtime}
# 4. If 409: Show error, prompt restart
# 5. If 200: Write SQL to migration file

# Success case:
✓ Compiled successfully: my_flow → SQL migration ready
✓ Created: supabase/migrations/20250101120000_create_my_flow.sql

# Stale worker case:
✗ Error: Worker has stale flow definition
  Worker started: 2025-01-01 12:00:00
  File modified: 2025-01-01 12:03:15
  Action: Restart worker and retry

$ # Restart and retry
$ # Ctrl+C to stop functions serve
$ supabase functions serve
$ pgflow compile supabase/functions/_flows/my-flow.ts
✓ Compiled successfully: my_flow → SQL migration ready
```

### 6. Fail-Fast Behavior
**Decision**: Return structured error response on production shape mismatch.

**The Question**: Does throwing during `EdgeWorker.start()` actually prevent Supabase deployment?
**Likely Answer**: Deployment succeeds but function returns 500s at runtime.

**Approach**: Catch initialization errors and return structured response:
```typescript
return new Response(JSON.stringify({
  error: "Flow shape mismatch detected",
  details: "Step 'process' dependencies changed: ['fetch'] → ['fetch', 'validate']",
  fix: "Create new version with slug 'analyze_website_v2' and redeploy"
}), { status: 500 });
```

**Protection Mechanisms** (MVP):
1. **Fast runtime failure**: Clear error response with specific fix instructions
2. **Skip pre-validation**: Too complex for MVP (requires prod DB access)
3. **Fast redeploy cycle**: Adequate for catching incompatible changes

**Benefits**:
- Clear error messages with actionable instructions
- Fast feedback loop for developers
- Simple implementation without complex validation

## Implementation Architecture

### Integration Point
**Location**: `FlowWorkerLifecycle.acknowledgeStart()`
**Timing**: After platform adapter creation, before transitioning to Running state

### Environment Detection

**Primary Detection: Supabase Environment Variables**
```typescript
const isLocalDev = !Boolean(
  Deno.env.get('DENO_DEPLOYMENT_ID') ||
  Deno.env.get('SB_REGION') ||
  Deno.env.get('SB_EXECUTION_ID')
);
```

These variables are automatically set by Supabase on hosted deployments and absent when running `supabase functions serve` locally.

**Additional Safety: Hostname Verification**

For added protection against accidental data clearing, optionally verify request hostname:

```typescript
function isDefinitelyLocal(request: Request): boolean {
  // Primary check: env vars
  const hasSupabaseEnvVars = Boolean(
    Deno.env.get('DENO_DEPLOYMENT_ID') ||
    Deno.env.get('SB_REGION') ||
    Deno.env.get('SB_EXECUTION_ID')
  );

  if (hasSupabaseEnvVars) {
    return false; // Definitely production
  }

  // Secondary check: hostname from request
  const url = new URL(request.url);
  const isLocalHost = url.hostname === 'localhost' ||
                      url.hostname === '127.0.0.1' ||
                      url.hostname.endsWith('.local');

  return isLocalHost;
}
```

**Benefits of Hostname Verification:**
- Defense in depth: Two independent checks
- Prevents accidental data clearing if env vars are misconfigured
- Clear "localhost" requirement makes safety explicit
- No false positives (production hostnames will never match)

**Trade-offs:**
- Slightly more complex
- Requires request object for hostname check
- Additional verification step

**Recommendation:** Implement hostname verification - the safety benefit far outweighs minimal complexity.

### Required SQL Functions

**Core Function - Atomic Flow Ensure with Advisory Lock**:
```sql
CREATE FUNCTION pgflow.ensure_flow(flow_shape jsonb)
RETURNS text AS $$
BEGIN
  -- Serialize operations per flow using advisory lock
  PERFORM pg_advisory_lock(hashtext(flow_shape->>'slug'));

  -- Parse flow definition from JSON
  -- Compare with existing flow (if exists)
  -- Handle runtime options vs structural differences
  -- Create/update flow atomically in single transaction
  -- Return: 'created' | 'matched' | 'updated' | 'conflict'

  RETURN result_status;
EXCEPTION
  WHEN OTHERS THEN
    -- Always release lock on error
    PERFORM pg_advisory_unlock(hashtext(flow_shape->>'slug'));
    RAISE;
END;
$$ LANGUAGE plpgsql;
```

**Advisory Lock Considerations**:

Advisory locks are essential for production when multiple workers start simultaneously, but require careful consideration:

**When Advisory Locks Are Needed:**
- Multiple worker instances starting at the same time
- Prevents race conditions during flow creation/update
- Ensures only one worker modifies flow definition at a time
- Critical for production horizontal scaling

**Potential Issues to Consider:**

1. **Lock Blocking Duration**
   - Workers block waiting for lock release
   - Could delay startup during simultaneous deployments
   - Need to measure typical ensure_flow() duration

2. **Lock Release on Connection Drop**
   - Advisory locks are per-session
   - Released when connection closes (good)
   - But if connection pools, lock lifetime tied to pool behavior

3. **Deadlock Scenarios**
   - Single flow lock is simple (low deadlock risk)
   - But if ensure_flow() calls other locked operations, careful ordering needed

4. **Lock Timeout Strategy**
   - Should workers wait indefinitely for lock?
   - Or timeout and fail fast?
   - Trade-off: patience vs fail-fast feedback

5. **Observability**
   - Need logging when workers block on advisory locks
   - Track lock wait times
   - Alert on excessive blocking

**Implementation Recommendations:**

1. **Start Simple**: Use advisory locks in ensure_flow()
2. **Add Observability**: Log when acquiring/releasing locks and wait times
3. **Monitor in Production**: Watch for unexpected blocking
4. **Document Behavior**: Make it clear workers may block during simultaneous deployments
5. **Consider Timeout**: Add optional timeout parameter for lock acquisition

**Alternative Consideration**: If advisory lock issues arise, could fall back to optimistic locking with version numbers, but this adds complexity. Start with advisory locks and iterate based on real-world behavior.

**Flow Shape Comparison**:
```sql
CREATE FUNCTION pgflow.get_flow_fingerprint(flow_slug text)
RETURNS jsonb AS $$
-- Returns structural comparison data (excludes runtime options)
-- Used for shape verification in production
$$ LANGUAGE sql;
```

**Development Helper Functions**:
```sql
-- Clear flow data for local dev
CREATE FUNCTION pgflow.clear_flow_data(flow_slug text) RETURNS void;

-- Compilation endpoint data
CREATE FUNCTION pgflow.get_flow_compilation_data(flow_slug text)
RETURNS jsonb; -- Returns flow shape for HTTP compilation
```

### Error Messages & Logging

**Shape Mismatch Examples**:
```
[ERROR] Flow definition mismatch detected for 'analyze_website':
- Step 'process' dependencies changed: ['fetch'] → ['fetch', 'validate']
- Step 'summary' step_index changed: 2 → 3
- New step 'validate' added at index 2

Action required: Create new flow version (e.g., 'analyze_website_v2')
with updated slug and deploy migration.
```

**Runtime Option Updates**:
```
[INFO] Updated runtime options for flow 'analyze_website':
- Step 'process': timeout 30s → 60s, max_attempts 3 → 5
- Flow: base_delay 5s → 10s
```

### Error Message Format

**Production Shape Mismatch Example**:
```
[ERROR] Flow 'analyze_website' shape mismatch detected:
- Step 'process' dependencies changed: ['fetch'] → ['fetch', 'validate']
- New step 'validate' added at index 2

FIX: Create new flow version:
1. Rename slug to 'analyze_website_v2' in flow definition
2. Redeploy worker code
3. Update client calls to use new version

Deployment failed - fix above issues and redeploy.
```

## Complete Workflow Examples

### Development Workflow (Local Dev Auto-Compilation)
```bash
# 1. Developer edits flow file
# 2. Restarts edge function: Ctrl+C, ↑ Enter
# 3. Worker startup calls pgflow.ensure_flow(flow_shape):
#    - Advisory lock ensures atomic operation
#    - Structural change → wipe data + recreate
#    - Runtime options only → update + preserve data
#    - No changes → continue normally
# 4. Ready to process tasks - no CLI steps needed!
```

### CI/CD Workflow (HTTP-Based Compilation)
```bash
# 1. CI/CD pipeline needs migration file
# 2. Start staging Edge Function (any instance)
# 3. pgflow compile supabase/functions/_flows/my-flow.ts
# 4. CLI gets compiled SQL from authoritative source via HTTP
# 5. Generate timestamped migration file
# 6. Deploy migration + worker code to production
```

### Advanced Architecture Scenarios

**Horizontal Scaling**:
```bash
# Multiple instances of same worker function
# Deploy my-flow-worker with multiple instances
# Any instance can provide compilation
pgflow compile supabase/functions/_flows/my-flow.ts  # Will hit any available instance

# With explicit worker (for custom naming):
pgflow compile supabase/functions/_flows/my-flow.ts --worker production-worker-1

# All instances:
# - Run the same flow
# - Can compile on demand
# - Use advisory locks to prevent race conditions
```

**Note on Multi-Queue Architecture**:
Future consideration: Specialized workers (cpu-worker, io-worker, db-worker) for different step types would require more complex architecture and is not part of the initial implementation. Current design: 1 function = 1 flow.

### Production Deployment (New Flow)
```bash
# 1. Deploy worker code with new flow
# 2. Worker starts, detects missing flow, auto-creates
# 3. Normal operation begins
```

### Production Deployment (Compatible Change)
```bash
# 1. Edit runtime options (timeout, max_attempts, etc.)
# 2. Deploy worker code
# 3. Worker starts, compares shapes, updates options only
# 4. Normal operation continues with new settings
```

### Production Deployment (Breaking Change)
```bash
# 1. Create new version: analyze_website_v2.ts with new slug
# 2. Deploy worker code
# 3. Worker starts, detects new flow slug, auto-creates v2
# 4. Gradually migrate clients to v2
# 5. Decommission v1 when no longer needed
```

### Production Deployment (Incompatible - Forgot to Version)
```bash
# 1. Edit flow structure without changing slug
# 2. Deploy worker code → deployment succeeds
# 3. Function calls return 500 with shape mismatch error
# 4. Developer sees error response, creates v2, redeploys
# 5. New deployment with v2 slug works correctly
```

## Benefits of This Approach

**Development Experience Revolution**:
- **Eliminates painful CLI workflow**: No more npm/Deno mismatch, import map complexity
- **Single step**: Edit code → Restart function → Ready
- **Preserves test data**: Smart shape comparison only wipes when necessary
- **Fast iteration**: Sub-second compilation vs current multi-step manual process
- **No forgotten steps**: Auto-compilation prevents common developer mistakes

**HTTP Compilation Game Changer**:
- **No local Deno required**: CLI becomes simple HTTP client
- **Authoritative source**: Runtime environment compiles its own definitions
- **CI/CD friendly**: Works from any machine with HTTP access
- **Eliminates tooling complexity**: Edge Function already has everything loaded

**Production Safety + Flexibility**:
- **Advisory locks**: Eliminate race conditions and data corruption
- **Data operations only**: Not schema changes, much safer than initially assessed
- **Explicit control option**: Can require migrations for production if preferred
- **Clear failure modes**: Detailed error messages with actionable instructions
- **Environment-appropriate behavior**: Auto-compile in dev, verify in production

**Technical Robustness**:
- **Atomic operations**: Single transaction eliminates partial failure states
- **Sub-second performance**: Not 30+ seconds as initially feared
- **Concurrency safe**: Advisory locks serialize per-flow operations
- **Backwards compatible**: Can implement alongside existing CLI workflow

**MVP Alignment**:
- **Solves real pain**: Current CLI workflow is genuinely awful
- **Huge productivity boost**: Especially valuable in local development
- **Simple core concept**: Just moves compilation timing, not complexity
- **Incremental adoption**: Can be implemented gradually
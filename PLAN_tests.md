# Auto-Compilation Testing Strategy

> Comprehensive testing plan for Phase 1 auto-compilation feature

---

## Executive Summary

The auto-compilation feature requires **two distinct test layers**:

1. **Integration Tests** (fast, ~2-3 min) - Test logic and SQL functions directly
2. **E2E Tests** (slower, ~5-10 min) - Test real edge function deployment with HTTP

**Why both?** Integration tests catch logic bugs quickly during development. E2E tests catch deployment issues that only appear in real Supabase Edge Runtime.

**Key Decision**: E2E tests run in separate CI job before deployment to provide layered confidence without slowing every commit.

---

## Test Layer 1: Integration Tests

### Purpose
- Fast feedback during TDD
- Test compilation logic in isolation
- Test SQL functions thoroughly
- Test worker behavior without HTTP overhead

### What Integration Tests Cover

#### 1. Environment Detection
**File**: `pkgs/edge-worker/tests/unit/platform-adapter.test.ts`

```typescript
Deno.test('detects local environment (no DENO_REGION)', () => {
  const adapter = new SupabasePlatformAdapter(() => ({
    ...testEnv,
    // No DENO_REGION = local
  }));
  assertEquals(adapter.environment, 'local');
});

Deno.test('detects production environment (DENO_REGION present)', () => {
  const adapter = new SupabasePlatformAdapter(() => ({
    ...testEnv,
    DENO_REGION: 'us-east-1',
  }));
  assertEquals(adapter.environment, 'production');
});
```

**Coverage**:
- Environment detection logic
- Warning message generation
- Constructor parameter injection (for testing)

#### 2. Flow Serialization
**File**: `pkgs/dsl/tests/unit/serialize-flow.test.ts`

```typescript
Deno.test('serializes flow with correct step order', () => {
  const flow = new Flow({ slug: 'test' })
    .step({ slug: 'step1' }, () => 'a')
    .step({ slug: 'step2', dependsOn: ['step1'] }, () => 'b');

  const shape = serializeFlow(flow);

  assertEquals(shape.steps[0].stepIndex, 0);
  assertEquals(shape.steps[1].stepIndex, 1);
  assertEquals(shape.steps[1].dependencies, ['step1']);
});

Deno.test('sorts dependencies deterministically', () => {
  const flow = new Flow({ slug: 'test' })
    .step({ slug: 'a' }, () => 'a')
    .step({ slug: 'b' }, () => 'b')
    .step({ slug: 'c', dependsOn: ['b', 'a'] }, () => 'c');

  const shape = serializeFlow(flow);

  // Dependencies sorted by stepIndex (a=0, b=1), then alphabetically
  assertEquals(shape.steps[2].dependencies, ['a', 'b']);
});
```

**Coverage**:
- Step index calculation from array position
- Dependency sorting (by stepIndex, then slug)
- Option serialization
- stepType handling (single vs map)

#### 3. SQL Functions
**File**: `pkgs/core/tests/pgtap/auto-compilation.test.sql`

```sql
-- Test compare_flow_shapes
SELECT plan(20);

-- Setup: Create flow with 2 steps
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.add_step('test_flow', 'step1');
SELECT pgflow.add_step('test_flow', 'step2', deps_slugs => ARRAY['step1']);

-- Test: Matching shape returns true
SELECT ok(
  pgflow.compare_flow_shapes(
    (SELECT id FROM pgflow.flows WHERE slug = 'test_flow'),
    '{"slug": "test_flow", "steps": [
      {"slug": "step1", "stepIndex": 0, "stepType": "single", "dependencies": []},
      {"slug": "step2", "stepIndex": 1, "stepType": "single", "dependencies": ["step1"]}
    ]}'::jsonb
  ),
  'Matching structure returns true'
);

-- Test: Mismatching shape returns false (different dependencies)
SELECT ok(
  NOT pgflow.compare_flow_shapes(
    (SELECT id FROM pgflow.flows WHERE slug = 'test_flow'),
    '{"slug": "test_flow", "steps": [
      {"slug": "step1", "stepIndex": 0, "stepType": "single", "dependencies": []},
      {"slug": "step2", "stepIndex": 1, "stepType": "single", "dependencies": []}
    ]}'::jsonb
  ),
  'Different dependencies returns false'
);

-- Test: Options changes do not affect comparison
SELECT ok(
  pgflow.compare_flow_shapes(
    (SELECT id FROM pgflow.flows WHERE slug = 'test_flow'),
    '{"slug": "test_flow", "options": {"maxAttempts": 999}, "steps": [
      {"slug": "step1", "stepIndex": 0, "stepType": "single", "dependencies": [], "options": {"timeout": 999}},
      {"slug": "step2", "stepIndex": 1, "stepType": "single", "dependencies": ["step1"]}
    ]}'::jsonb
  ),
  'Options changes do not affect shape comparison'
);

SELECT finish();
```

**Coverage**:
- `compare_flow_shapes()` - structural comparison logic
- `ensure_flow_compiled()` - decision tree (create/noop/recreate/fail)
- `drop_flow_data()` - queue cleanup + FK cascade
- `create_flow_from_shape()` - JSON parsing + creation
- `create_step_from_json()` - step + dependency creation

#### 4. Worker Lifecycle Integration
**File**: `pkgs/edge-worker/tests/integration/auto-compilation.test.ts`

```typescript
Deno.test('local - creates new flow on worker startup', async () => {
  await withPgNoTransaction(async (sql) => {
    // Create flow definition
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'step1' }, async () => ({ result: 'hello' }));

    // Create local adapter
    const adapter = new SupabasePlatformAdapter(() => ({
      ...testEnv,
      // No DENO_REGION = local
    }));

    // Create and start worker (bypasses HTTP)
    const worker = createFlowWorker(
      flow,
      { sql, maxConcurrent: 1 },
      createLogger,
      adapter
    );

    worker.startOnlyOnce({
      edgeFunctionName: 'test-worker',
      workerId: crypto.randomUUID(),
    });

    // Verify auto-compilation created flow
    const flows = await sql`
      SELECT * FROM pgflow.flows WHERE slug = 'test_flow'
    `;
    assertEquals(flows.length, 1);

    const steps = await sql`
      SELECT * FROM pgflow.steps WHERE flow_slug = 'test_flow'
    `;
    assertEquals(steps.length, 1);
    assertEquals(steps[0].step_slug, 'step1');

    await worker.stop();
  });
});

Deno.test('local - noop when shapes match', async () => {
  await withPgNoTransaction(async (sql) => {
    // Pre-create flow
    await sql`SELECT pgflow.create_flow('test_flow')`;
    await sql`SELECT pgflow.add_step('test_flow', 'step1')`;

    const initialCreatedAt = await sql`
      SELECT created_at FROM pgflow.flows WHERE slug = 'test_flow'
    `;

    // Start worker with SAME shape
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'step1' }, async () => ({ result: 'hello' }));

    const worker = createFlowWorker(flow, { sql }, createLogger, localAdapter);
    worker.startOnlyOnce({ edgeFunctionName: 'test', workerId: '123' });

    // Verify no changes (created_at unchanged)
    const finalCreatedAt = await sql`
      SELECT created_at FROM pgflow.flows WHERE slug = 'test_flow'
    `;
    assertEquals(initialCreatedAt[0].created_at, finalCreatedAt[0].created_at);

    await worker.stop();
  });
});

Deno.test('local - drop+recreate when shapes mismatch', async () => {
  await withPgNoTransaction(async (sql) => {
    // Pre-create flow with 1 step + test data
    await sql`SELECT pgflow.create_flow('test_flow')`;
    await sql`SELECT pgflow.add_step('test_flow', 'step1')`;
    await sql`INSERT INTO pgflow.runs (flow_slug, status) VALUES ('test_flow', 'running')`;

    // Start worker with 2 steps (mismatch!)
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'step1' }, async () => 'a')
      .step({ slug: 'step2', dependsOn: ['step1'] }, async () => 'b');

    const worker = createFlowWorker(flow, { sql }, createLogger, localAdapter);
    worker.startOnlyOnce({ edgeFunctionName: 'test', workerId: '123' });

    // Verify recreated with 2 steps
    const steps = await sql`
      SELECT * FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_index
    `;
    assertEquals(steps.length, 2);
    assertEquals(steps[0].step_slug, 'step1');
    assertEquals(steps[1].step_slug, 'step2');

    // Verify test data was dropped
    const runs = await sql`
      SELECT * FROM pgflow.runs WHERE flow_slug = 'test_flow'
    `;
    assertEquals(runs.length, 0);

    await worker.stop();
  });
});

Deno.test('production - throws on shape mismatch', async () => {
  await withPgNoTransaction(async (sql) => {
    // Pre-create flow
    await sql`SELECT pgflow.create_flow('test_flow')`;
    await sql`SELECT pgflow.add_step('test_flow', 'step1')`;

    // Create production adapter
    const prodAdapter = new SupabasePlatformAdapter(() => ({
      ...testEnv,
      DENO_REGION: 'us-east-1', // Production!
    }));

    // Different shape
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'step1' }, async () => 'a')
      .step({ slug: 'step2' }, async () => 'b');

    const worker = createFlowWorker(flow, { sql }, createLogger, prodAdapter);

    // Should throw exception
    await assertRejects(
      () => worker.startOnlyOnce({ edgeFunctionName: 'test', workerId: '123' }),
      Error,
      /structure mismatch.*Deploy migration first/
    );
  });
});
```

**Coverage**:
- All behavior matrix scenarios (6 scenarios)
- Worker lifecycle integration
- Database state verification
- Error message validation
- Advisory lock behavior (via multiple parallel tests)

### Integration Test Benefits

✅ **Fast** - No HTTP server, no Docker startup, runs in 2-3 minutes
✅ **Reliable** - No process management, no timing issues
✅ **Debuggable** - Stack traces connect directly to source
✅ **Isolatable** - Each test creates fresh worker instance
✅ **Parallelizable** - Tests can run concurrently

### Integration Test Limitations

❌ **Skips EdgeWorker.start()** - Uses createFlowWorker() directly
❌ **No HTTP layer** - Bypasses Deno.serve() and HTTP request handling
❌ **No function file structure** - Doesn't test supabase/functions/ layout
❌ **No real restarts** - Can't test stopping functions serve and restarting
❌ **No Edge Runtime quirks** - Misses Supabase-specific behaviors

---

## Test Layer 2: E2E Tests

### Purpose
- Validate real deployment scenario
- Test HTTP trigger flow end-to-end
- Catch Supabase Edge Runtime integration issues
- Test actual function restart workflow

### What E2E Tests Cover

#### Critical Scenarios Integration Tests MISS

1. **EdgeWorker.start() Entry Point**
   - Integration tests use `createFlowWorker()` directly
   - E2E tests call `EdgeWorker.start()` from actual function file
   - Catches bugs in platform adapter creation
   - Validates static method behavior

2. **HTTP Trigger Flow**
   - First HTTP POST initializes worker
   - SupabasePlatformAdapter.setupStartupHandler() behavior
   - Deno.serve() integration
   - Response handling ("ok" status)

3. **Supabase Edge Runtime Environment**
   - Module resolution (import maps, Deno runtime)
   - Permission model
   - Environment variable handling
   - Edge Runtime Docker container behavior

4. **Real Function File Structure**
   - `supabase/functions/*/index.ts` layout
   - Import paths and resolution
   - Export patterns
   - Function naming conventions

5. **Actual Restart Scenario**
   - Stop `supabase functions serve`
   - Update function code files
   - Restart `supabase functions serve`
   - Verify new code is loaded

6. **Race Conditions**
   - Multiple HTTP requests during worker initialization
   - Advisory lock behavior under real load
   - Timing between HTTP request and database update

### E2E Test Infrastructure

#### Component 1: FunctionsServer Manager
**File**: `pkgs/edge-worker/tests/e2e-auto-compilation/_infrastructure.ts`

```typescript
export class FunctionsServer {
  private process: Deno.ChildProcess | null = null;
  private functionsDir: string;

  constructor(functionsDir: string) {
    this.functionsDir = functionsDir;
  }

  async start(): Promise<void> {
    this.process = new Deno.Command('supabase', {
      args: ['functions', 'serve', '--env-file', 'test.env', '--no-verify-jwt'],
      cwd: this.functionsDir,
      stdout: 'piped',
      stderr: 'piped',
    }).spawn();

    // Wait for "Serving functions on http://localhost:54321"
    await this.waitForReady();
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      await this.process.status;
      this.process = null;
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await new Promise(r => setTimeout(r, 1000)); // Let port release
    await this.start();
  }

  private async waitForReady(): Promise<void> {
    const startTime = Date.now();
    const timeout = 30000; // 30 seconds

    while (Date.now() - startTime < timeout) {
      try {
        // Try to hit any function endpoint
        const response = await fetch('http://localhost:54321/functions/v1/_health', {
          method: 'GET',
        });
        // If we get a response (even 404), server is ready
        return;
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    throw new Error('Functions server did not start within 30 seconds');
  }
}
```

#### Component 2: Function Code Generator
**File**: `pkgs/edge-worker/tests/e2e-auto-compilation/_function-generator.ts`

```typescript
export interface FunctionGeneratorOptions {
  functionName: string;
  flowCode: string;
  simulateProduction?: boolean;
  importPath?: string;
}

export async function generateTestFunction(
  options: FunctionGeneratorOptions
): Promise<string> {
  const { functionName, flowCode, simulateProduction = false, importPath } = options;

  const functionDir = `./test-functions/${functionName}`;
  await Deno.mkdir(functionDir, { recursive: true });

  // Generate import map
  const importMapContent = {
    imports: {
      '@pgflow/edge-worker': importPath || '../../dist/index.js',
      '@pgflow/dsl': '../../../dsl/dist/index.js',
    }
  };
  await Deno.writeTextFile(
    `${functionDir}/import_map.json`,
    JSON.stringify(importMapContent, null, 2)
  );

  // Generate function code
  const code = `
${simulateProduction ? "Deno.env.set('DENO_REGION', 'test-us-east-1');" : ''}

import { EdgeWorker } from '@pgflow/edge-worker';
import { Flow } from '@pgflow/dsl';

${flowCode}

EdgeWorker.start(TestFlow);
`;

  await Deno.writeTextFile(`${functionDir}/index.ts`, code);

  return functionDir;
}

export async function cleanupTestFunction(functionName: string): Promise<void> {
  const functionDir = `./test-functions/${functionName}`;
  try {
    await Deno.remove(functionDir, { recursive: true });
  } catch {
    // Ignore errors
  }
}
```

#### Component 3: HTTP Test Helpers
**File**: `pkgs/edge-worker/tests/e2e-auto-compilation/_helpers.ts`

```typescript
export async function triggerWorker(
  functionName: string,
  payload?: unknown
): Promise<Response> {
  return await fetch(`http://localhost:54321/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

export async function waitForFlowInDatabase(
  sql: postgres.Sql,
  flowSlug: string,
  timeoutMs: number = 5000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const flows = await sql`
      SELECT * FROM pgflow.flows WHERE slug = ${flowSlug}
    `;

    if (flows.length > 0) {
      return;
    }

    await new Promise(r => setTimeout(r, 200));
  }

  throw new Error(`Flow '${flowSlug}' not found in database after ${timeoutMs}ms`);
}
```

### E2E Test Examples

#### Test 1: Local Mode - New Flow
**File**: `pkgs/edge-worker/tests/e2e-auto-compilation/local-new-flow.test.ts`

```typescript
import { FunctionsServer } from './_infrastructure.ts';
import { generateTestFunction, cleanupTestFunction } from './_function-generator.ts';
import { triggerWorker, waitForFlowInDatabase } from './_helpers.ts';

Deno.test('E2E: Local mode auto-creates new flow on first HTTP request', async () => {
  const functionName = 'test-worker-new-flow';
  const flowSlug = 'e2e_new_flow';
  const server = new FunctionsServer('./test-functions');
  const sql = createSql();

  try {
    // 1. Generate test function
    const flowCode = `
      const TestFlow = new Flow({ slug: '${flowSlug}' })
        .step({ slug: 'step1' }, async () => ({ result: 'hello' }));
    `;

    await generateTestFunction({
      functionName,
      flowCode,
      simulateProduction: false,
    });

    // 2. Start functions server
    await server.start();

    // 3. Trigger worker via HTTP
    const response = await triggerWorker(functionName);

    // 4. Verify HTTP response
    assertEquals(response.status, 200);
    assertEquals(await response.text(), 'ok');

    // 5. Wait for flow to appear in database
    await waitForFlowInDatabase(sql, flowSlug);

    // 6. Verify flow structure
    const flows = await sql`
      SELECT * FROM pgflow.flows WHERE slug = ${flowSlug}
    `;
    assertEquals(flows.length, 1);

    const steps = await sql`
      SELECT * FROM pgflow.steps WHERE flow_slug = ${flowSlug}
    `;
    assertEquals(steps.length, 1);
    assertEquals(steps[0].step_slug, 'step1');

  } finally {
    // Cleanup
    await server.stop();
    await sql`DELETE FROM pgflow.flows WHERE slug = ${flowSlug}`;
    await sql.end();
    await cleanupTestFunction(functionName);
  }
});
```

#### Test 2: Restart with Code Changes
**File**: `pkgs/edge-worker/tests/e2e-auto-compilation/restart-with-changes.test.ts`

```typescript
Deno.test('E2E: Restart with changed flow code updates database (local mode)', async () => {
  const functionName = 'test-worker-restart';
  const flowSlug = 'e2e_restart_flow';
  const server = new FunctionsServer('./test-functions');
  const sql = createSql();

  try {
    // 1. Generate initial function (1 step)
    const flowV1 = `
      const TestFlow = new Flow({ slug: '${flowSlug}' })
        .step({ slug: 'step1' }, async () => ({ result: 'v1' }));
    `;
    await generateTestFunction({ functionName, flowCode: flowV1 });

    // 2. Start server and trigger worker
    await server.start();
    await triggerWorker(functionName);
    await waitForFlowInDatabase(sql, flowSlug);

    // 3. Verify initial state (1 step)
    let steps = await sql`
      SELECT * FROM pgflow.steps
      WHERE flow_slug = ${flowSlug}
      ORDER BY step_index
    `;
    assertEquals(steps.length, 1);
    assertEquals(steps[0].step_slug, 'step1');

    // 4. Update function code (add step)
    const flowV2 = `
      const TestFlow = new Flow({ slug: '${flowSlug}' })
        .step({ slug: 'step1' }, async () => ({ result: 'v1' }))
        .step({ slug: 'step2', dependsOn: ['step1'] }, async () => ({ result: 'v2' }));
    `;
    await generateTestFunction({ functionName, flowCode: flowV2 });

    // 5. Restart server (simulates new deployment)
    await server.restart();

    // 6. Trigger worker again
    await triggerWorker(functionName);

    // 7. Wait for database update (brief delay for auto-compilation)
    await new Promise(r => setTimeout(r, 1000));

    // 8. Verify flow was updated (local mode: drop+recreate)
    steps = await sql`
      SELECT * FROM pgflow.steps
      WHERE flow_slug = ${flowSlug}
      ORDER BY step_index
    `;
    assertEquals(steps.length, 2);
    assertEquals(steps[0].step_slug, 'step1');
    assertEquals(steps[1].step_slug, 'step2');

  } finally {
    await server.stop();
    await sql`DELETE FROM pgflow.flows WHERE slug = ${flowSlug}`;
    await sql.end();
    await cleanupTestFunction(functionName);
  }
});
```

#### Test 3: Production Mode Rejection
**File**: `pkgs/edge-worker/tests/e2e-auto-compilation/prod-rejects-mismatch.test.ts`

```typescript
Deno.test('E2E: Production mode rejects shape mismatch', async () => {
  const functionName = 'test-worker-prod';
  const flowSlug = 'e2e_prod_flow';
  const server = new FunctionsServer('./test-functions');
  const sql = createSql();

  try {
    // 1. Pre-create flow with structure A
    await sql`SELECT pgflow.create_flow(${flowSlug})`;
    await sql`SELECT pgflow.add_step(${flowSlug}, 'step1')`;

    // 2. Generate function with structure B + production flag
    const flowCode = `
      const TestFlow = new Flow({ slug: '${flowSlug}' })
        .step({ slug: 'step1' }, async () => 'a')
        .step({ slug: 'step2' }, async () => 'b'); // Different structure!
    `;
    await generateTestFunction({
      functionName,
      flowCode,
      simulateProduction: true, // Sets DENO_REGION
    });

    // 3. Start server and trigger worker
    await server.start();
    const response = await triggerWorker(functionName);

    // 4. Verify HTTP error response
    // Note: SupabasePlatformAdapter should catch and return error
    assertEquals(response.status, 500);

    const errorText = await response.text();
    assert(errorText.includes('structure mismatch'));
    assert(errorText.includes('Deploy migration first'));

    // 5. Verify flow was NOT updated
    const steps = await sql`
      SELECT * FROM pgflow.steps WHERE flow_slug = ${flowSlug}
    `;
    assertEquals(steps.length, 1); // Still only 1 step

  } finally {
    await server.stop();
    await sql`DELETE FROM pgflow.flows WHERE slug = ${flowSlug}`;
    await sql.end();
    await cleanupTestFunction(functionName);
  }
});
```

### E2E Test Challenges and Solutions

#### Challenge 1: Production Environment Simulation

**Problem**: Locally, `DENO_REGION` is not set by Edge Runtime.

**Solution**: Manually set `DENO_REGION` in test function code:
```typescript
Deno.env.set('DENO_REGION', 'test-us-east-1');
```

**Limitation**: Not a TRUE production environment, but close enough to test rejection logic.

#### Challenge 2: Process Lifecycle Management

**Problem**: Starting/stopping `supabase functions serve` reliably.

**Solution**:
- Use `Deno.Command` with proper signal handling
- Implement `waitForReady()` polling
- Always use try/finally for cleanup
- Add delays after stop to let ports release

#### Challenge 3: Function Code Generation

**Problem**: Tests need to write actual function files dynamically.

**Solution**:
- Template-based generation in `_function-generator.ts`
- Consistent directory structure: `./test-functions/${functionName}/`
- Generate both `index.ts` and `import_map.json`
- Clean up after tests (even on failure)

#### Challenge 4: Timing and Synchronization

**Problem**: Multiple async operations need coordination.

**Solution**:
- `waitForReady()` polls HTTP endpoint until server responds
- `waitForFlowInDatabase()` polls DB until flow appears
- Add small delays after restart for process cleanup
- Use generous timeouts (30s) for CI stability

#### Challenge 5: Test Isolation

**Problem**: Tests share database and function port.

**Solution**:
- Unique flow slugs per test (`e2e_new_flow`, `e2e_restart_flow`)
- Database cleanup in finally blocks
- Directory cleanup in finally blocks
- Run tests sequentially (not in parallel) for E2E suite

#### Challenge 6: Debugging Failures

**Problem**: Multiple processes make debugging hard.

**Solution**:
- Capture stdout/stderr from functions serve
- Log HTTP requests and responses
- Include database state in assertions
- Clear error messages with context

### E2E Test Benefits

✅ **Deployment confidence** - Tests actual deployment scenario
✅ **Catches runtime issues** - Finds Edge Runtime specific bugs
✅ **Validates HTTP flow** - Tests complete request/response cycle
✅ **Tests restarts** - Verifies actual function reload behavior
✅ **Real environment** - As close to production as possible locally

### E2E Test Tradeoffs

⚠️ **Slower** - 5-10 minutes vs 2-3 minutes for integration
⚠️ **More complex** - Process management, file generation, timing
⚠️ **Harder to debug** - Multiple processes, async operations
⚠️ **Resource intensive** - Docker, HTTP server, port usage
⚠️ **Not fully production** - Can't truly simulate DENO_REGION behavior

---

## CI/CD Strategy

### Layered Testing Approach

```yaml
# .github/workflows/ci.yml
jobs:
  test-fast:
    name: Unit + Integration Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: Lint, typecheck, unit/integration tests
        run: pnpm nx affected -t lint typecheck test --parallel
    # Fast: 2-3 minutes

  build:
    name: Build Affected Projects
    needs: test-fast
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: Build
        run: pnpm nx affected -t build --parallel
    # Fast: 1-2 minutes

  test-e2e:
    name: E2E Tests
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Start Supabase
        run: pnpm nx supabase:start edge-worker

      - name: Run E2E tests
        run: pnpm nx test:e2e edge-worker
        timeout-minutes: 15

      - name: Stop Supabase
        if: always()
        run: pnpm nx supabase:stop edge-worker
    # Slower: 5-10 minutes

  deploy:
    name: Deploy to Staging/Production
    needs: test-e2e
    runs-on: ubuntu-latest
    # Only deploy if ALL tests pass
```

### Why Separate E2E Job?

**Benefits:**
1. **Fast feedback** - Unit/integration tests complete in 2-3 min
2. **Parallel execution** - Can run on different runners
3. **Skip for docs** - E2E only runs when code changes
4. **Clear failure isolation** - Know exactly which layer failed
5. **Resource management** - E2E gets dedicated resources

**Cost:**
- +5-10 minutes to total CI time
- More complex workflow configuration

**Decision**: Worth it for auto-compilation (major feature requiring deployment confidence).

### When to Skip E2E Tests

E2E tests should be skipped for:
- Documentation-only changes
- Comment updates
- README changes
- Non-code changes

Implementation:
```yaml
test-e2e:
  needs: build
  if: contains(github.event.head_commit.modified, 'pkgs/')
```

---

## Test Coverage Matrix

### Behavior Matrix (from PLAN_phase1.md)

| Environment | Flow Exists? | Shapes Match? | Expected Behavior       | Integration | E2E |
|-------------|--------------|---------------|-------------------------|-------------|-----|
| Local       | No           | N/A           | Create fresh            | ✅          | ✅  |
| Local       | Yes          | Match         | Continue (noop)         | ✅          | ✅  |
| Local       | Yes          | Mismatch      | Drop all → Recreate     | ✅          | ✅  |
| Production  | No           | N/A           | Create fresh            | ✅          | ⚠️* |
| Production  | Yes          | Match         | Continue (noop)         | ✅          | ⚠️* |
| Production  | Yes          | Mismatch      | RAISE EXCEPTION         | ✅          | ✅  |

*Production behavior with matching shapes can be tested in E2E by setting DENO_REGION manually.

### Component Coverage

| Component | Unit Tests | Integration Tests | E2E Tests |
|-----------|-----------|-------------------|-----------|
| Environment detection | ✅ | ✅ | ✅ |
| serializeFlow() | ✅ | ✅ | ✅ |
| compare_flow_shapes() | ✅ (PgTAP) | ✅ | ✅ |
| ensure_flow_compiled() | ✅ (PgTAP) | ✅ | ✅ |
| drop_flow_data() | ✅ (PgTAP) | ✅ | ✅ |
| create_flow_from_shape() | ✅ (PgTAP) | ✅ | ✅ |
| FlowWorkerLifecycle | ❌ | ✅ | ✅ |
| EdgeWorker.start() | ❌ | ❌ | ✅ |
| HTTP trigger | ❌ | ❌ | ✅ |
| Function restart | ❌ | ❌ | ✅ |

### Critical Edge Cases

| Edge Case | How Tested |
|-----------|------------|
| Advisory locks prevent race conditions | Integration (parallel tests) |
| Queue cleanup on drop | Integration + PgTAP |
| Multiple flows in one worker | Integration |
| Empty flow (no steps) | Integration |
| Map step flows | Integration |
| Concurrent HTTP requests during startup | E2E |
| Function code syntax errors | E2E (would fail to start) |
| Import resolution issues | E2E |
| DENO_REGION presence/absence | E2E (both modes) |

---

## Implementation Phases

### Phase 1: Core Logic + Integration Tests (~5 days)

**Day 1-2: Core Components**
1. Environment detection in SupabasePlatformAdapter
2. serializeFlow() function
3. Unit tests for both

**Day 3-4: SQL Functions**
1. compare_flow_shapes()
2. ensure_flow_compiled()
3. drop_flow_data()
4. create_flow_from_shape()
5. create_step_from_json()
6. PgTAP tests for all

**Day 5: Integration**
1. Wire auto-compilation into FlowWorkerLifecycle.acknowledgeStart()
2. Integration tests for all behavior matrix scenarios
3. TestFlowFactory helper

**Deliverable**: Fully tested auto-compilation logic, ready for manual testing.

### Phase 2: E2E Infrastructure + Tests (~3 days)

**Day 6: Infrastructure**
1. FunctionsServer class
2. Function generator
3. HTTP test helpers
4. Test cleanup utilities

**Day 7-8: E2E Test Suite**
1. Local mode: new flow
2. Local mode: matching shapes (noop)
3. Local mode: shape mismatch (drop+recreate)
4. Production mode: rejection
5. Restart with code changes
6. Multiple flows in one function

**Deliverable**: Full E2E test suite with real function deployment.

### Phase 3: CI Integration (~1 day)

**Day 9: GitHub Actions**
1. Update CI workflow with separate test-e2e job
2. Add Supabase setup step
3. Configure test timeouts
4. Add cleanup on failure
5. Document CI workflow in README

**Deliverable**: Auto-compilation feature fully tested in CI before deployment.

---

## Testing Philosophy

### Test Pyramid

```
        /\
       /  \      E2E Tests (10%)
      /----\     - Slow, expensive
     /      \    - High confidence
    /--------\   - Deployment validation
   /          \
  /------------\ Integration Tests (30%)
 /--------------\- Medium speed
/----------------\- SQL + Worker logic
|================| Unit Tests (60%)
|                | - Fast, focused
|                | - Pure functions
|                | - Immediate feedback
```

### Guiding Principles

1. **Fast Feedback First**
   - Unit tests run in milliseconds
   - Integration tests run in seconds
   - E2E tests run in minutes

2. **Test at the Right Level**
   - Unit: Pure logic (serializeFlow, environment detection)
   - Integration: SQL functions + worker behavior
   - E2E: HTTP → Worker → DB complete flow

3. **Don't Test Implementation Details**
   - Test behavior, not internals
   - Integration tests can bypass HTTP (that's fine!)
   - E2E tests validate deployment scenario

4. **Balance Coverage with Maintenance**
   - E2E tests are expensive to maintain
   - Focus E2E on critical deployment paths
   - Use integration tests for detailed scenarios

5. **Make Failures Clear**
   - Descriptive test names
   - Helpful assertion messages
   - Log context on failure

---

## Success Criteria

Auto-compilation testing is complete when:

- ✅ All 6 behavior matrix scenarios have integration tests
- ✅ All SQL functions have PgTAP tests with >90% coverage
- ✅ Environment detection has unit tests for all modes
- ✅ serializeFlow() has unit tests for all step patterns
- ✅ E2E tests validate HTTP → Worker → DB flow
- ✅ E2E tests validate function restart scenario
- ✅ CI runs both test layers before deployment
- ✅ CI completes in <15 minutes total
- ✅ Tests are documented and maintainable

---

## References

- **Implementation Plan**: [PLAN_phase1.md](./PLAN_phase1.md)
- **User Documentation**: [COMPILE_WORKER.md](./COMPILE_WORKER.md)
- **Phase 2 Enhancements**: [PLAN_phase2.md](./PLAN_phase2.md)

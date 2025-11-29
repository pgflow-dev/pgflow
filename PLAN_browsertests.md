# Plan: Browser Testing for @pgflow/client

## Context

The setTimeout binding bug (fixed in this PR) was not caught by existing tests because:

1. **Unit tests use fake timers** - Vitest's `vi.useFakeTimers()` mocks setTimeout, hiding context binding issues
2. **Integration tests run in Node.js** - Node.js is permissive with function context, browsers are strict
3. **No browser-environment testing** - All tests run in Node.js, never in actual browser environments

The bug only manifests in real browsers when `setTimeout` loses its `window`/`globalThis` context.

## Goal

Add browser-based testing to catch browser-specific issues like:
- Function context binding (setTimeout, setInterval, requestAnimationFrame)
- DOM API compatibility
- Web API behavior (Fetch, WebSocket, etc.)
- Browser-specific quirks

## Solution: Vitest Browser Mode

Use Vitest's built-in browser mode to run tests in real browsers (Chromium, Firefox, Safari).

### Why Vitest Browser Mode?

- ✅ Runs tests in **actual browsers**, not Node.js
- ✅ Uses Playwright/WebdriverIO under the hood
- ✅ Integrates seamlessly with existing Vitest setup
- ✅ Supports parallel execution with Node.js tests
- ✅ CI/CD friendly (headless mode)
- ✅ No separate test framework needed

## Implementation Plan

### Phase 1: Setup Infrastructure

**1. Install dependencies**
```bash
pnpm add -D @vitest/browser playwright
```

**2. Update vitest.workspace.ts**

Add browser test configuration alongside existing Node.js config:

```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  './vitest.config.ts', // existing Node.js tests
  {
    test: {
      name: 'browser',
      include: [
        'pkgs/**/*.browser.test.ts',
        'apps/**/*.browser.test.ts',
      ],
      browser: {
        enabled: true,
        provider: 'playwright',
        instances: [
          { browser: 'chromium' },
        ],
        headless: true, // CI-friendly
      },
    },
  },
])
```

**3. Add npm scripts**

```json
{
  "scripts": {
    "test:browser": "vitest --workspace --project browser",
    "test:browser:ui": "vitest --workspace --project browser --ui",
    "test:all": "vitest --workspace"
  }
}
```

### Phase 2: Migrate setTimeout Binding Test

**1. Rename test file**
```
pkgs/client/__tests__/SupabaseBroadcastAdapter.setTimeout-binding.test.ts
→
pkgs/client/__tests__/SupabaseBroadcastAdapter.setTimeout-binding.browser.test.ts
```

**2. Simplify test** (no mocking needed in browser)

```typescript
import { describe, it, expect } from 'vitest'
import { SupabaseBroadcastAdapter } from '../src/lib/SupabaseBroadcastAdapter.js'
import { createClient } from '@supabase/supabase-js'

describe('SupabaseBroadcastAdapter - Browser Environment', () => {
  const supabaseUrl = 'https://test.supabase.co'
  const supabaseKey = 'test-key'

  it('should handle setTimeout without losing context', async () => {
    // In a real browser, if setTimeout binding is broken, this will throw:
    // "TypeError: 'setTimeout' called on an object that does not implement interface Window"

    const supabase = createClient(supabaseUrl, supabaseKey)
    const adapter = new SupabaseBroadcastAdapter(supabase, {
      reconnectDelayMs: 100,
      stabilizationDelayMs: 100,
    })

    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => {
        setTimeout(() => callback('SUBSCRIBED'), 10)
        return mockChannel
      }),
      unsubscribe: vi.fn(),
    }

    supabase.channel = vi.fn().mockReturnValue(mockChannel)

    // This should work without throwing
    await expect(
      adapter.subscribeToRun('test-run-id')
    ).resolves.toBeDefined()
  })
})
```

### Phase 3: Identify Other Browser-Critical Tests

Tests that should run in browser mode:

**From `@pgflow/client`:**
- SupabaseBroadcastAdapter (realtime subscriptions, setTimeout/setInterval usage)
- PgflowClient (browser-specific Supabase client behavior)
- Any code using Web APIs (Fetch, WebSocket, localStorage, etc.)

**From `apps/demo`:**
- Svelte component rendering
- User interactions (clicks, form submissions)
- Realtime updates in the UI

### Phase 4: CI/CD Integration

**Update `.github/workflows/ci.yml`:**

```yaml
- name: Run browser tests
  run: pnpm nx affected -t test:browser --base=$NX_BASE --head=$NX_HEAD
```

**Playwright installation** (for CI):
```yaml
- name: Install Playwright browsers
  run: pnpm exec playwright install chromium
```

### Phase 5: Documentation

**Update `pkgs/client/README.md`:**

```markdown
## Testing

### Unit Tests (Node.js)
```bash
pnpm nx test client
```

### Browser Tests
```bash
pnpm nx test:browser client
```

Browser tests run in real browsers to catch browser-specific issues
like function context binding, DOM API compatibility, etc.
```

## Test Coverage Strategy

### Node.js Tests (Current)
- Fast execution
- Mock-heavy
- Business logic
- Integration with database
- Most existing tests stay here

### Browser Tests (New)
- Slower execution
- Minimal mocking
- Browser-specific behavior
- Web API compatibility
- DOM interactions
- Context binding issues

## Migration Strategy

**DO NOT migrate all tests to browser mode.**

Only migrate/create browser tests for:
1. Browser-specific bugs (like setTimeout binding)
2. DOM interactions
3. Web API usage
4. Visual/rendering tests (if needed in future)

Most tests should remain in Node.js for speed.

## Future Enhancements

**1. Multi-browser testing**
```typescript
instances: [
  { browser: 'chromium' },
  { browser: 'firefox' },
  { browser: 'webkit' }, // Safari
],
```

**2. Visual regression testing**
```typescript
import { page } from '@vitest/browser/context'

it('renders correctly', async () => {
  await page.screenshot({ path: 'snapshot.png' })
})
```

**3. Performance testing**
```typescript
it('loads within 2 seconds', async () => {
  const start = performance.now()
  await adapter.subscribeToRun('test-run-id')
  const duration = performance.now() - start
  expect(duration).toBeLessThan(2000)
})
```

## Success Criteria

- [ ] Vitest browser mode configured and working
- [ ] setTimeout binding test runs in real browser
- [ ] CI/CD runs browser tests in headless mode
- [ ] Documentation updated
- [ ] Team knows when to write browser vs Node.js tests

## Risks & Mitigations

**Risk:** Browser tests are slower than Node.js tests
**Mitigation:** Only use browser mode for browser-specific tests, keep most tests in Node.js

**Risk:** CI/CD needs Playwright browsers installed
**Mitigation:** Add `playwright install` step to CI workflow

**Risk:** Flaky tests in browser environments
**Mitigation:** Use Vitest's built-in retry mechanism, proper waits/expectations

## References

- [Vitest Browser Mode Guide](https://vitest.dev/guide/browser/)
- [Vitest Browser Mode Discussion](https://github.com/vitest-dev/vitest/discussions/5828)
- [Playwright Provider](https://github.com/vitest-dev/vitest/tree/main/packages/browser)

## Timeline

**Estimated effort:** 4-8 hours

- Phase 1 (Setup): 1-2 hours
- Phase 2 (Migrate test): 1 hour
- Phase 3 (Identify tests): 1-2 hours
- Phase 4 (CI/CD): 1-2 hours
- Phase 5 (Docs): 1 hour

## Open Questions

1. Should we run browser tests on every PR or only on main?
2. Which browsers should we support in CI? (Chromium only vs all three)
3. Do we need visual regression testing for the demo app?
4. Should browser tests be required to pass for PRs to merge?

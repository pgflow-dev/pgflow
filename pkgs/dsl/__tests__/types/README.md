# Type Testing Infrastructure

This directory contains TypeScript type tests using a **hybrid approach** that combines:
1. **Vitest `expectTypeOf`** for positive type assertions (clear error messages)
2. **`@ts-expect-error`** for negative assertions (enforces code doesn't compile)

## Running Type Tests

```bash
# Run all type tests (vitest + TS2578 validation)
pnpm nx test:types dsl

# Individual targets for faster iteration:
pnpm nx test:types:vitest dsl    # Vitest only (fast, ~300ms)
pnpm nx test:types:strict dsl    # TS2578 validation only

# Health check (verifies testing infrastructure works)
pnpm nx test:types:health dsl
```

## Development Workflow

**Fast iteration (during development):**
```bash
pnpm nx test:types:vitest dsl  # Fast, nice output
```

**Full validation (before commit):**
```bash
pnpm nx test:types dsl  # Runs both vitest and TS2578 checks
```

## Health Check System

### Purpose
The health check ensures the type testing infrastructure itself is working correctly. Without this, type tests could silently break and fail to catch bugs.

### Components

#### 1. Canary File (`__canary__.test-d.ts`)
- **Intentionally fails** type checking
- Contains known type errors that MUST be detected
- Excluded from normal test runs (see `tsconfig.typecheck.json`)
- Tests both `expectTypeOf` and `@ts-expect-error` mechanisms

#### 2. Verification Script (`scripts/verify-type-test-health.sh`)
Runs diagnostic tests to verify:
- tsc detects type errors
- `expectTypeOf` produces clear "Expected X, Actual Y" messages
- TS2578 detection works (unused `@ts-expect-error`)
- Expected error patterns appear (TS2344, TS2578)

#### 3. Nx Target (`test:types:health`)
Run with: `pnpm nx test:types:health dsl`

### When to Run Health Check

- **After TypeScript version upgrades**
- **After Vitest updates**
- **After modifying tsconfig files**
- **After changing typecheck-ts2578.sh script**
- **In CI** (recommended: run weekly or on release branches)

### Expected Output

✅ **Healthy system:**
```
✅ SUCCESS: Type testing infrastructure is healthy

All checks passed:
  • Pass 1 (project-wide) catches type errors
  • expectTypeOf produces clear error messages
  • Pass 2 (individual files) catches TS2578 errors
  • Canary file exhibits expected error patterns
```

❌ **Broken system:**
```
❌ FAILURE: Type testing infrastructure is BROKEN

This means type tests may not be catching bugs!
```

## Hybrid Testing Approach

### Use `expectTypeOf` for Positive Assertions

```typescript
it('should correctly infer types', () => {
  const flow = new Flow<{ userId: string }>({ slug: 'test' })
    .step({ slug: 's1' }, () => 42);

  const step = flow.getStepDefinition('s1');

  // Clear, explicit type assertion
  expectTypeOf(step.handler).returns.toEqualTypeOf<number>();
});
```

**Benefits:**
- ✅ Clear error messages: `"Expected: number, Actual: string"`
- ✅ Explicit about what types SHOULD be
- ✅ Good for complex type testing

### Use `@ts-expect-error` for Negative Assertions

```typescript
it('should reject invalid handlers', () => {
  new Flow({ slug: 'test' })
    // @ts-expect-error - should reject null return
    .array({ slug: 'bad' }, () => null)

    // @ts-expect-error - should reject undefined return
    .array({ slug: 'bad2' }, () => undefined);
});
```

**Benefits:**
- ✅ Actually enforces code doesn't compile
- ✅ Detected by typecheck-ts2578.sh via TS2578
- ✅ Tests real-world usage patterns

### Why Both?

- **`expectTypeOf`**: Tests type relationships and transformations
- **`@ts-expect-error`**: Tests that invalid code is actually rejected

Using both provides comprehensive coverage and catches different classes of bugs.

## Troubleshooting

### Health Check Fails

1. Check TypeScript version: `pnpm tsc --version`
2. Check Vitest version: `pnpm vitest --version`
3. Review `tsconfig.typecheck.json`
4. Check `typecheck-ts2578.sh` script
5. Look at canary file errors: `pnpm tsc --noEmit __tests__/types/__canary__.test-d.ts`

### Type Tests Pass But Should Fail

This usually means:
- Type signatures are too permissive
- Missing `@ts-expect-error` directives
- Run health check to verify infrastructure works

### TS2578 Not Detected

- Ensure `typecheck-ts2578.sh` runs correctly
- Check that file is included in typecheck
- Verify `@ts-expect-error` is on its own line above the code

## Adding New Type Tests

1. **Choose the right tool**:
   - Positive assertion (what type IS) → `expectTypeOf`
   - Negative assertion (what shouldn't compile) → `@ts-expect-error`

2. **Follow existing patterns** in the test files

3. **Run health check** after major changes:
   ```bash
   pnpm nx test:types:health dsl
   ```

4. **Test your tests**: Temporarily break the type signature and ensure the test fails

/**
 * TYPE TESTING HEALTH CHECK FILE
 *
 * This file intentionally contains type errors to verify that our type testing
 * infrastructure is working correctly. It should NEVER pass type checking.
 *
 * ⚠️  DO NOT INCLUDE IN NORMAL TEST RUNS ⚠️
 * ⚠️  EXCLUDED FROM tsconfig.typecheck.json ⚠️
 *
 * Purpose:
 * - Verifies that expectTypeOf detects type mismatches
 * - Verifies that @ts-expect-error unused directive detection works
 * - Verifies that typecheck-ts2578.sh catches errors correctly
 *
 * Verified by: scripts/verify-type-test-health.sh
 * Run with: pnpm nx test:types:health dsl
 */

import { describe, it, expectTypeOf } from 'vitest';
import { Flow } from '../../src/index.js';

describe('Health: expectTypeOf detects type mismatches', () => {
  it('MUST FAIL: detects wrong return type with clear error message', () => {
    const flow = new Flow<{ count: number }>({ slug: 'health_test' })
      .array({ slug: 'items' }, () => [1, 2, 3]);

    const arrayStep = flow.getStepDefinition('items');

    // This MUST fail with: "Expected: string, Actual: number"
    expectTypeOf(arrayStep.handler).returns.toEqualTypeOf<string[]>();
  });

  it('MUST FAIL: detects input type mismatch', () => {
    const flow = new Flow<{ userId: string }>({ slug: 'health_test2' })
      .step({ slug: 'step1' }, () => 42);

    const step = flow.getStepDefinition('step1');

    // This MUST fail - expecting number input but it's { run: { userId: string } }
    expectTypeOf(step.handler).parameter(0).toEqualTypeOf<{ run: { userId: number } }>();
  });
});

describe('Health: @ts-expect-error unused directive detection', () => {
  it('MUST FAIL: detects unused @ts-expect-error (TS2578)', () => {
    const validArray = new Flow({ slug: 'health_test3' })
      .array({ slug: 'numbers' }, () => [1, 2, 3]);

    // These @ts-expect-error directives are UNUSED because the types are actually valid
    // They MUST trigger TS2578 errors in Pass 2 of typecheck-ts2578.sh

    // @ts-expect-error - HEALTH: This is actually valid, so TS2578 should fire
    const step1 = validArray.getStepDefinition('numbers');

    // @ts-expect-error - HEALTH: This is actually valid, so TS2578 should fire
    const handler = step1.handler;

    // Suppress unused variable warnings
    void handler;
  });
});

describe('Health: Hybrid approach validation', () => {
  it('MUST FAIL: both expectTypeOf and @ts-expect-error work together', () => {
    const flow = new Flow<{ value: number }>({ slug: 'health_hybrid' })
      .step({ slug: 's1' }, () => 'result');

    // expectTypeOf assertion that MUST fail
    expectTypeOf(flow.getStepDefinition('s1').handler).returns.toEqualTypeOf<number>();

    // @ts-expect-error that is unused (no actual error) - MUST trigger TS2578
    // @ts-expect-error - HEALTH: This line is actually valid
    const validStep = flow.getStepDefinition('s1');
    void validStep;
  });
});

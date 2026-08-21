import { assertEquals, assertThrows } from '@std/assert';
import { getProcessDeps } from '../../../src/platform/processDeps.ts';

/**
 * Replaces globalThis.process with a fake for the duration of one check and
 * restores the original property descriptor afterwards.
 */
async function withFakeProcess(
  processLike: Record<string, unknown> | undefined,
  check: () => Promise<void> | void
): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'process');
  try {
    Object.defineProperty(globalThis, 'process', {
      value: processLike,
      configurable: true,
      writable: true,
      enumerable: true,
    });
    await check();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'process', original);
    } else {
      delete (globalThis as { process?: unknown }).process;
    }
  }
}

Deno.test('getProcessDeps works without process.off and omits offSignal', async () => {
  await withFakeProcess(
    { env: { SUPABASE_URL: 'https://example.supabase.co' }, on: () => {}, exit: () => {} },
    () => {
      const deps = getProcessDeps();

      assertEquals(typeof deps.onSignal, 'function');
      assertEquals(typeof deps.exit, 'function');
      assertEquals(typeof deps.randomUUID, 'function');
      assertEquals(deps.offSignal, undefined, 'offSignal must be optional when process.off is absent');
    }
  );
});

Deno.test('getProcessDeps exposes offSignal when process.off exists', async () => {
  await withFakeProcess(
    { env: {}, on: () => {}, off: () => {}, exit: () => {} },
    () => {
      const deps = getProcessDeps();

      assertEquals(typeof deps.offSignal, 'function');
    }
  );
});

Deno.test('getProcessDeps still requires env, on, exit, and randomUUID', async () => {
  await withFakeProcess({ off: () => {} }, () => {
    assertThrows(() => getProcessDeps(), Error, 'Process runtime is not available');
  });
});

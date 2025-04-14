/// <reference types="deno/full.d.ts" />

/**
 * Minimal type definitions for Deno APIs used in our codebase.
 * These are used for type checking during build in Node.js environment.
 * At runtime in Deno, the actual Deno implementations will be used.
 */

// Define minimal Deno namespace interface
declare global {
  // Define EdgeRuntime interface
  interface EdgeRuntimeNamespace {
    waitUntil(promise: Promise<unknown>): void;
  }

  // In DenoAdapter.ts, we assume these are always available
  // This makes TypeScript happy without requiring non-null assertions
  // We need to use 'var' here for proper global declaration in TypeScript
  // eslint-disable-next-line no-var
  var EdgeRuntime: EdgeRuntimeNamespace;
}

// Export empty object to make this a module
export {};

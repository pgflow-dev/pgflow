/**
 * Minimal type definitions for Deno APIs used in our codebase.
 * These are used for type checking during build in Node.js environment.
 * At runtime in Deno, the actual Deno implementations will be used.
 */

// Define minimal Deno namespace interface
declare global {
  interface DenoNamespace {
    serve(options: any, handler: (req: Request) => Response | Promise<Response>): void;
    env: {
      get(key: string): string | undefined;
    };
  }

  // Define EdgeRuntime interface
  interface EdgeRuntimeNamespace {
    waitUntil(promise: Promise<any>): void;
  }

  // In DenoAdapter.ts, we assume these are always available
  // This makes TypeScript happy without requiring non-null assertions
  var Deno: DenoNamespace;
  var EdgeRuntime: EdgeRuntimeNamespace;
}

// Export empty object to make this a module
export {};

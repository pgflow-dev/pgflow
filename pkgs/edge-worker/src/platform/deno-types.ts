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

  // Make these available globally but as potentially undefined
  // This allows our code to check if they exist before using them
  var Deno: DenoNamespace | undefined;
  var EdgeRuntime: EdgeRuntimeNamespace | undefined;
}

// Export empty object to make this a module
export {};

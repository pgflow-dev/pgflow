/**
 * Platform dependencies interface for abstracting Deno/EdgeRuntime globals.
 * This enables unit testing of SupabasePlatformAdapter without mocking globals.
 */
export interface SupabasePlatformDeps {
  getEnv: () => Record<string, string | undefined>;
  onShutdown: (handler: () => void | Promise<void>) => void;
  extendLifetime: (promise: Promise<unknown>) => void;
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
}

/**
 * Type for globalThis with EdgeRuntime available (Supabase Edge Functions).
 */
type EdgeRuntimeGlobal = typeof globalThis & {
  EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
};

/**
 * Default implementation using Deno runtime globals.
 */
const defaultDeps: SupabasePlatformDeps = {
  getEnv: () => Deno.env.toObject(),
  onShutdown: (h) => {
    globalThis.onbeforeunload = h;
  },
  extendLifetime: (p) => (globalThis as EdgeRuntimeGlobal).EdgeRuntime.waitUntil(p),
  serve: (h) => Deno.serve({}, h),
};

let currentDeps = defaultDeps;

/**
 * Get current platform dependencies.
 * Used by createAdapter() to pass deps to SupabasePlatformAdapter.
 */
export const getPlatformDeps = (): SupabasePlatformDeps => currentDeps;

/**
 * Configure platform dependencies for testing.
 * Exported via /testing entry point.
 *
 * WARNING: This is a permanent override for the lifetime of the process.
 * There is no reset function - once configured, the overrides stay active.
 * This is intentional for edge functions where the mock must persist across
 * all HTTP requests. If scoped mocking with cleanup is needed in the future,
 * consider adding resetPlatform() and withMockPlatform() utilities.
 */
export function configurePlatform(overrides: Partial<SupabasePlatformDeps>): void {
  console.warn(
    '[pgflow] configurePlatform() called - platform deps permanently overridden:',
    Object.keys(overrides).join(', ')
  );
  currentDeps = { ...defaultDeps, ...overrides };
}

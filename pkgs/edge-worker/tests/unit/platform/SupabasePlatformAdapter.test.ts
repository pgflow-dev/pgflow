import { assertEquals, assertThrows } from '@std/assert';
import { SupabasePlatformAdapter } from '../../../src/platform/SupabasePlatformAdapter.ts';
import type { SupabasePlatformDeps } from '../../../src/platform/deps.ts';
import type { Worker } from '../../../src/core/Worker.ts';

/**
 * Creates a minimal mock worker for testing.
 */
function createMockWorker(): Worker {
  return {
    startOnlyOnce: () => {},
    stop: () => Promise.resolve(),
  } as unknown as Worker;
}

/**
 * Creates mock platform deps for testing.
 * All functions are no-ops by default.
 */
function createMockDeps(overrides?: Partial<SupabasePlatformDeps>): SupabasePlatformDeps {
  return {
    getEnv: () => ({
      SUPABASE_URL: 'http://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      SB_EXECUTION_ID: 'test-exec-id',
      EDGE_WORKER_DB_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
    }),
    onShutdown: () => {},
    extendLifetime: () => {},
    serve: () => {},
    ...overrides,
  };
}

// ============================================================
// Environment Validation Tests
// ============================================================

Deno.test('throws when SUPABASE_URL missing', () => {
  const deps = createMockDeps({
    getEnv: () => ({
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      SB_EXECUTION_ID: 'test-exec-id',
    }),
  });

  assertThrows(
    () => new SupabasePlatformAdapter(undefined, deps),
    Error,
    'SUPABASE_URL'
  );
});

Deno.test('throws when SUPABASE_SERVICE_ROLE_KEY missing', () => {
  const deps = createMockDeps({
    getEnv: () => ({
      SUPABASE_URL: 'http://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SB_EXECUTION_ID: 'test-exec-id',
    }),
  });

  assertThrows(
    () => new SupabasePlatformAdapter(undefined, deps),
    Error,
    'SUPABASE_SERVICE_ROLE_KEY'
  );
});

Deno.test('throws when SB_EXECUTION_ID missing', () => {
  const deps = createMockDeps({
    getEnv: () => ({
      SUPABASE_URL: 'http://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    }),
  });

  assertThrows(
    () => new SupabasePlatformAdapter(undefined, deps),
    Error,
    'SB_EXECUTION_ID'
  );
});

Deno.test('includes helpful error message with docs link', () => {
  const deps = createMockDeps({
    getEnv: () => ({}),
  });

  assertThrows(
    () => new SupabasePlatformAdapter(undefined, deps),
    Error,
    'pgflow.dev'
  );
});

// ============================================================
// Property Accessors
// ============================================================

Deno.test({
  name: 'env returns validated environment',
  sanitizeResources: false,
  fn: () => {
    const expectedEnv = {
      SUPABASE_URL: 'http://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      SB_EXECUTION_ID: 'test-exec-id',
      EDGE_WORKER_DB_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
    };

    const deps = createMockDeps({
      getEnv: () => expectedEnv,
    });

    const adapter = new SupabasePlatformAdapter(undefined, deps);

    assertEquals(adapter.env.SUPABASE_URL, expectedEnv.SUPABASE_URL);
    assertEquals(adapter.env.SB_EXECUTION_ID, expectedEnv.SB_EXECUTION_ID);
  },
});

Deno.test({
  name: 'shutdownSignal returns abort signal',
  sanitizeResources: false,
  fn: () => {
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    assertEquals(adapter.shutdownSignal.aborted, false);
  },
});

Deno.test({
  name: 'sql returns platform SQL client',
  sanitizeResources: false,
  fn: () => {
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    // sql should be defined (it's a postgres.Sql instance)
    assertEquals(typeof adapter.sql, 'function');
  },
});

Deno.test({
  name: 'supabase returns platform Supabase client',
  sanitizeResources: false,
  fn: () => {
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    // supabase client should have from method
    assertEquals(typeof adapter.supabase.from, 'function');
  },
});

Deno.test({
  name: 'platformResources exposes sql and supabase',
  sanitizeResources: false,
  fn: () => {
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    assertEquals(typeof adapter.platformResources.sql, 'function');
    assertEquals(typeof adapter.platformResources.supabase.from, 'function');
  },
});

// ============================================================
// Connection Resolution Tests
// ============================================================

Deno.test({
  name: 'uses options.connectionString when provided',
  sanitizeResources: false,
  fn: () => {
    const customConnectionString = 'postgresql://custom:custom@custom:5432/custom';
    const deps = createMockDeps();

    const adapter = new SupabasePlatformAdapter({ connectionString: customConnectionString }, deps);

    assertEquals(adapter.connectionString, customConnectionString);
  },
});

Deno.test({
  name: 'uses EDGE_WORKER_DB_URL from env when no options',
  sanitizeResources: false,
  fn: () => {
    const envDbUrl = 'postgresql://env:env@env:5432/env';
    const deps = createMockDeps({
      getEnv: () => ({
        SUPABASE_URL: 'http://test.supabase.co',
        SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
        SB_EXECUTION_ID: 'test-exec-id',
        EDGE_WORKER_DB_URL: envDbUrl,
      }),
    });

    const adapter = new SupabasePlatformAdapter(undefined, deps);

    assertEquals(adapter.connectionString, envDbUrl);
  },
});

// ============================================================
// Local Environment Detection Tests
// ============================================================

Deno.test({
  name: 'isLocalEnvironment returns true for local Supabase URL (kong)',
  sanitizeResources: false,
  fn: () => {
    const deps = createMockDeps({
      getEnv: () => ({
        SUPABASE_URL: 'http://kong:8000', // Local dev URL
        SUPABASE_ANON_KEY: 'any-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'any-service-key',
        SB_EXECUTION_ID: 'test-exec-id',
        EDGE_WORKER_DB_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
      }),
    });

    const adapter = new SupabasePlatformAdapter(undefined, deps);

    assertEquals(adapter.isLocalEnvironment, true);
  },
});

Deno.test({
  name: 'isLocalEnvironment returns false for production URL',
  sanitizeResources: false,
  fn: () => {
    const deps = createMockDeps({
      getEnv: () => ({
        SUPABASE_URL: 'https://abc123.supabase.co', // Production URL
        SUPABASE_ANON_KEY: 'any-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'any-service-key',
        SB_EXECUTION_ID: 'test-exec-id',
        EDGE_WORKER_DB_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
      }),
    });

    const adapter = new SupabasePlatformAdapter(undefined, deps);

    assertEquals(adapter.isLocalEnvironment, false);
  },
});

// ============================================================
// Lifecycle Tests
// ============================================================

Deno.test({
  name: 'startWorker calls extendLifetime with promise',
  sanitizeResources: false,
  fn: async () => {
    let extendLifetimeCalled = false;
    let extendLifetimeArg: unknown = null;

    const deps = createMockDeps({
      extendLifetime: (p) => {
        extendLifetimeCalled = true;
        extendLifetimeArg = p;
      },
    });

    const adapter = new SupabasePlatformAdapter(undefined, deps);
    await adapter.startWorker(() => createMockWorker());

    assertEquals(extendLifetimeCalled, true);
    assertEquals(extendLifetimeArg instanceof Promise, true);
  },
});

Deno.test({
  name: 'startWorker registers shutdown handler via onShutdown',
  sanitizeResources: false,
  fn: async () => {
    let onShutdownCalled = false;
    let shutdownHandler: (() => void | Promise<void>) | null = null;

    const deps = createMockDeps({
      onShutdown: (h) => {
        onShutdownCalled = true;
        shutdownHandler = h;
      },
    });

    const adapter = new SupabasePlatformAdapter(undefined, deps);
    await adapter.startWorker(() => createMockWorker());

    assertEquals(onShutdownCalled, true);
    assertEquals(typeof shutdownHandler, 'function');
  },
});

Deno.test({
  name: 'startWorker registers HTTP handler via serve',
  sanitizeResources: false,
  fn: async () => {
    let serveCalled = false;
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;

    const deps = createMockDeps({
      serve: (h) => {
        serveCalled = true;
        serveHandler = h;
      },
    });

    const adapter = new SupabasePlatformAdapter(undefined, deps);
    await adapter.startWorker(() => createMockWorker());

    assertEquals(serveCalled, true);
    assertEquals(typeof serveHandler, 'function');
  },
});

Deno.test({
  name: 'stopWorker aborts the shutdown signal',
  sanitizeResources: false,
  fn: async () => {
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    assertEquals(adapter.shutdownSignal.aborted, false);

    await adapter.stopWorker();

    assertEquals(adapter.shutdownSignal.aborted, true);
  },
});

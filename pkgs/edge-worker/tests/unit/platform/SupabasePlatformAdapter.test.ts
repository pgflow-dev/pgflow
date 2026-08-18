import { assertEquals, assertInstanceOf, assertRejects, assertStringIncludes, assertThrows } from '@std/assert';
import { FakeTime } from '@std/testing/time';
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

Deno.test({
  name: 'ignores DATABASE_URL when EDGE_WORKER_DB_URL is also set',
  sanitizeResources: false,
  fn: () => {
    const deps = createMockDeps({
      getEnv: () => ({
        SUPABASE_URL: 'https://abc123.supabase.co',
        SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
        SB_EXECUTION_ID: 'test-exec-id',
        DATABASE_URL: 'postgresql://unrelated:5432/database',
        EDGE_WORKER_DB_URL: 'postgresql://edge-worker:5432/database',
      }),
    });

    const adapter = new SupabasePlatformAdapter(undefined, deps);

    assertEquals(
      adapter.connectionString,
      'postgresql://edge-worker:5432/database'
    );
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
  name: 'HTTP startup passes http start mode to worker bootstrap',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    let bootstrap: unknown = null;

    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
    });
    const sql = (() => Promise.resolve([{ has_active: true }])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => Promise.resolve();

    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    await adapter.startWorker(() => ({
      startOnlyOnce: (workerBootstrap: unknown) => {
        bootstrap = workerBootstrap;
      },
      stop: () => Promise.resolve(),
    } as unknown as Worker));

    const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;
    await handler(new Request('http://localhost/functions/v1/my-worker', {
      headers: { authorization: 'Bearer test-service-key' },
    }));

    assertEquals(bootstrap, {
      edgeFunctionName: 'functions/v1/my-worker',
      workerId: 'test-exec-id',
      startMode: 'http',
    });
  },
});

Deno.test({
  name: 'HTTP startup returns a controlled 500 and retries with a fresh worker',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    let rejectStartup = (_error: Error) => {};
    let createCount = 0;

    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
    });
    const sql = (() => Promise.resolve([])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => Promise.resolve();

    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    await adapter.startWorker(() => {
      createCount++;
      return {
        startOnlyOnce: () => createCount === 1
          ? new Promise<void>((_resolve, reject) => {
            rejectStartup = reject;
          })
          : Promise.resolve(),
        stop: () => Promise.resolve(),
        get isDeprecated() {
          return false;
        },
        get isStopped() {
          return false;
        },
      } as unknown as Worker;
    });

    const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;
    const request = () => new Request('http://localhost/functions/v1/my-worker', {
      headers: { authorization: 'Bearer test-service-key' },
    });

    let responseSettled = false;
    const responsePromise = Promise.resolve(handler(request()));
    responsePromise.then(() => {
      responseSettled = true;
    });
    await Promise.resolve();

    assertEquals(responseSettled, false, 'Response must wait for worker readiness');

    rejectStartup(new Error('sensitive database details'));
    const failedResponse = await responsePromise;
    const failedBody = await failedResponse.text();

    assertEquals(failedResponse.status, 500);
    assertEquals(failedBody.includes('sensitive database details'), false);
    assertEquals(JSON.parse(failedBody), {
      error: 'Internal Server Error',
      message: 'Internal Server Error',
    });

    const retryResponse = await handler(request()) as Response;
    const retryBody = await retryResponse.json();

    assertEquals(retryResponse.status, 200);
    assertEquals(retryBody.status, 'started');
    assertEquals(createCount, 2);
    assertEquals(retryBody.workerId === 'test-exec-id', false);
  },
});

Deno.test({
  name: 'HTTP startup uses a fresh worker id when replacing deprecated worker',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    const workerIds: string[] = [];
    let firstWorkerStopped = false;
    let requestShutdown: (() => void) | null = null;
    const workers: Worker[] = [
      {
        startOnlyOnce: (workerBootstrap: { workerId: string }) => {
          workerIds.push(workerBootstrap.workerId);
        },
        stop: () => {
          firstWorkerStopped = true;
          requestShutdown?.();
          return Promise.resolve();
        },
        get isDeprecated() {
          return true;
        },
        get isStopped() {
          return false;
        },
      } as unknown as Worker,
      {
        startOnlyOnce: (workerBootstrap: { workerId: string }) => {
          workerIds.push(workerBootstrap.workerId);
        },
        stop: () => Promise.resolve(),
        get isDeprecated() {
          return false;
        },
        get isStopped() {
          return false;
        },
      } as unknown as Worker,
    ];

    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
    });
    const sql = (() => Promise.resolve([{ has_active: true }])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => Promise.resolve();

    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    requestShutdown = () => adapter.requestShutdown();
    await adapter.startWorker(() => workers.shift()!);

    const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;
    await handler(new Request('http://localhost/functions/v1/my-worker', {
      headers: { authorization: 'Bearer test-service-key' },
    }));

    const secondResponse = await handler(new Request('http://localhost/functions/v1/my-worker', {
      headers: { authorization: 'Bearer test-service-key' },
    })) as Response;
    const secondBody = await secondResponse.json();

    assertEquals(workerIds.length, 2);
    assertEquals(workerIds[0], 'test-exec-id');
    assertEquals(workerIds[1] !== workerIds[0], true);
    assertEquals(firstWorkerStopped, true);
    assertEquals(adapter.shutdownSignal.aborted, false);
    assertEquals(secondBody.workerId, workerIds[1]);
  },
});

Deno.test({
  name: 'HTTP startup serializes concurrent deprecated worker replacement',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    const workerIds: string[] = [];
    let stopCalls = 0;
    let releaseStop = () => {};
    let resolveStopStarted: (() => void) | null = null;
    const stopStarted = new Promise<void>((resolve) => {
      resolveStopStarted = resolve;
    });

    const deprecatedWorker = {
      startOnlyOnce: (workerBootstrap: { workerId: string }) => {
        workerIds.push(workerBootstrap.workerId);
      },
      stop: () => {
        stopCalls++;
        resolveStopStarted?.();
        return new Promise<void>((release) => {
          releaseStop = release;
        });
      },
      get isDeprecated() {
        return true;
      },
      get isStopped() {
        return false;
      },
    } as unknown as Worker;

    const replacementWorker = {
      startOnlyOnce: (workerBootstrap: { workerId: string }) => {
        workerIds.push(workerBootstrap.workerId);
      },
      stop: () => Promise.resolve(),
      get isDeprecated() {
        return false;
      },
      get isStopped() {
        return false;
      },
    } as unknown as Worker;

    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
    });
    const sql = (() => Promise.resolve([{ has_active: true }])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => Promise.resolve();

    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    let createCount = 0;

    await adapter.startWorker(() => {
      createCount++;
      return createCount === 1 ? deprecatedWorker : replacementWorker;
    });

    const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;
    await handler(new Request('http://localhost/functions/v1/my-worker', {
      headers: { authorization: 'Bearer test-service-key' },
    }));

    const replacements = Promise.all([
      handler(new Request('http://localhost/functions/v1/my-worker', {
        headers: { authorization: 'Bearer test-service-key' },
      })),
      handler(new Request('http://localhost/functions/v1/my-worker', {
        headers: { authorization: 'Bearer test-service-key' },
      })),
    ]);

    await stopStarted;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertEquals(stopCalls, 1);
    releaseStop();
    await replacements;

    assertEquals(workerIds.length, 2);
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

Deno.test({
  name: 'stopWorker drains worker before closing sql',
  sanitizeResources: false,
  fn: async () => {
    const callOrder: string[] = [];
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    (adapter as unknown as { worker: Worker | null }).worker = {
      startOnlyOnce: () => {},
      stop: () => {
        callOrder.push('worker.stop');
        return Promise.resolve();
      },
    } as unknown as Worker;

    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      callOrder.push('sql.end');
      return Promise.resolve();
    };

    adapter.shutdownSignal.addEventListener('abort', () => {
      callOrder.push('abort');
    }, { once: true });

    await adapter.stopWorker();

    assertEquals(callOrder, ['abort', 'worker.stop', 'sql.end']);
  },
});

Deno.test({
  name: 'stopWorker closes sql when worker stop rejects',
  sanitizeResources: false,
  fn: async () => {
    const callOrder: string[] = [];
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    (adapter as unknown as { worker: Worker | null }).worker = {
      startOnlyOnce: () => {},
      stop: () => {
        callOrder.push('worker.stop');
        return Promise.reject(new Error('stop failed'));
      },
    } as unknown as Worker;

    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      callOrder.push('sql.end');
      return Promise.resolve();
    };

    try {
      await adapter.stopWorker();
    } catch {
      // expected: the original worker.stop error should still reject
    }

    assertEquals(callOrder, ['worker.stop', 'sql.end']);
  },
});

Deno.test({
  name: 'shutdown during pending startup aborts immediately and marks only after startup settles',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    let shutdownHandler: (() => void | Promise<void>) | null = null;
    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
      onShutdown: (h) => {
        shutdownHandler = h;
      },
    });

    const events: string[] = [];
    const sql = (() => Promise.resolve([{ has_active: true }])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => {
      events.push('sql.end');
      return Promise.resolve();
    };

    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    (adapter as unknown as {
      queries: { markWorkerStopped: (workerId: string) => Promise<void> };
    }).queries.markWorkerStopped = (_workerId) => {
      events.push('markWorkerStopped');
      return Promise.resolve();
    };

    let resolveStartup = () => {};
    let workerStopCalls = 0;
    const worker = {
      startOnlyOnce: () => new Promise<void>((resolve) => {
        resolveStartup = resolve;
      }),
      stop: () => {
        workerStopCalls++;
        events.push('worker.stop');
        return Promise.resolve();
      },
      get isDeprecated() {
        return false;
      },
      get isStopped() {
        return false;
      },
    } as unknown as Worker;

    await adapter.startWorker(() => worker);

    const request = () => new Request('http://localhost/functions/v1/my-worker', {
      headers: { authorization: 'Bearer test-service-key' },
    });
    const responsePromise = serveHandler!(request());
    await new Promise((resolve) => setTimeout(resolve, 0));

    const shutdownPromise = shutdownHandler!();

    assertEquals(
      adapter.shutdownSignal.aborted,
      true,
      'shutdown signal must abort while startup is still pending'
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertEquals(events, [], 'no mark, worker stop, or sql close before startup settles');
    assertEquals(workerStopCalls, 0);

    resolveStartup();
    await responsePromise;
    await shutdownPromise;

    assertEquals(
      events,
      ['worker.stop', 'markWorkerStopped', 'sql.end'],
      'after startup settles the order must be drain, mark, close'
    );
    assertEquals(workerStopCalls, 1);
  },
});

Deno.test({
  name: 'shutdown during failing startup closes sql without stopping the cleared worker',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    let shutdownHandler: (() => void | Promise<void>) | null = null;
    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
      onShutdown: (h) => {
        shutdownHandler = h;
      },
    });

    const events: string[] = [];
    const sql = (() => Promise.resolve([])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => {
      events.push('sql.end');
      return Promise.resolve();
    };

    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    (adapter as unknown as {
      queries: { markWorkerStopped: (workerId: string) => Promise<void> };
    }).queries.markWorkerStopped = (_workerId) => {
      events.push('markWorkerStopped');
      return Promise.resolve();
    };

    let rejectStartup = (_error: Error) => {};
    let workerStopCalls = 0;
    const worker = {
      startOnlyOnce: () => new Promise<void>((_resolve, reject) => {
        rejectStartup = reject;
      }),
      stop: () => {
        workerStopCalls++;
        return Promise.resolve();
      },
      get isDeprecated() {
        return false;
      },
      get isStopped() {
        return false;
      },
    } as unknown as Worker;

    await adapter.startWorker(() => worker);

    const request = () => new Request('http://localhost/functions/v1/my-worker', {
      headers: { authorization: 'Bearer test-service-key' },
    });
    const responsePromise = serveHandler!(request());
    await new Promise((resolve) => setTimeout(resolve, 0));

    const shutdownPromise = shutdownHandler!();

    rejectStartup(new Error('startup failed'));
    const response = await responsePromise;
    assertEquals(response.status, 500);

    await shutdownPromise;

    assertEquals(events, ['sql.end'], 'sql must close and nothing must be marked or stopped');
    assertEquals(workerStopCalls, 0, 'cleared worker must not be stopped');
  },
});

Deno.test({
  name: 'stopWorker still stops worker and closes sql when marking rejects',
  sanitizeResources: false,
  fn: async () => {
    const events: string[] = [];
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    (adapter as unknown as { worker: Worker | null }).worker = {
      startOnlyOnce: () => {},
      stop: () => {
        events.push('worker.stop');
        return Promise.resolve();
      },
    } as unknown as Worker;
    (adapter as unknown as { workerId: string | null }).workerId = 'worker-1';
    (adapter as unknown as {
      queries: { markWorkerStopped: (workerId: string) => Promise<void> };
    }).queries.markWorkerStopped = (_workerId) => {
      events.push('markWorkerStopped');
      return Promise.reject(new Error('mark failed'));
    };

    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      events.push('sql.end');
      return Promise.resolve();
    };

    await assertRejects(() => adapter.stopWorker(), Error, 'mark failed');

    assertEquals(
      events,
      ['worker.stop', 'markWorkerStopped', 'sql.end'],
      'worker must stop and sql must close even when marking rejects'
    );
  },
});

Deno.test({
  name: 'concurrent stopWorker calls share one stop operation',
  sanitizeResources: false,
  fn: async () => {
    const events: string[] = [];
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    (adapter as unknown as { worker: Worker | null }).worker = {
      startOnlyOnce: () => {},
      stop: () => {
        events.push('worker.stop');
        return Promise.resolve();
      },
    } as unknown as Worker;
    (adapter as unknown as { workerId: string | null }).workerId = 'worker-1';
    (adapter as unknown as {
      queries: { markWorkerStopped: (workerId: string) => Promise<void> };
    }).queries.markWorkerStopped = (_workerId) => {
      events.push('markWorkerStopped');
      return Promise.resolve();
    };

    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      events.push('sql.end');
      return Promise.resolve();
    };

    const p1 = adapter.stopWorker();
    const p2 = adapter.stopWorker();

    assertEquals(p1 === p2, true, 'Concurrent stopWorker calls should return the same promise');

    await p1;

    assertEquals(events, ['worker.stop', 'markWorkerStopped', 'sql.end']);
  },
});

Deno.test({
  name: 'stopWorker before the first HTTP request closes sql without creating or marking a worker',
  sanitizeResources: false,
  fn: async () => {
    const events: string[] = [];
    let createCount = 0;
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    (adapter as unknown as {
      queries: { markWorkerStopped: (workerId: string) => Promise<void> };
    }).queries.markWorkerStopped = (_workerId) => {
      events.push('markWorkerStopped');
      return Promise.resolve();
    };

    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      events.push('sql.end');
      return Promise.resolve();
    };

    await adapter.startWorker(() => {
      createCount++;
      return createMockWorker();
    });
    await adapter.stopWorker();

    assertEquals(createCount, 0, 'no worker may be created before the first HTTP request');
    assertEquals(events, ['sql.end'], 'nothing to mark, sql closes once');
  },
});

Deno.test({
  name: 'shutdown during deprecated worker replacement keeps the signal aborted',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    const events: string[] = [];
    const markedIds: string[] = [];

    let releaseOldStop = () => {};
    let resolveOldStopStarted: (() => void) | null = null;
    const oldStopStarted = new Promise<void>((resolve) => {
      resolveOldStopStarted = resolve;
    });

    const deprecatedWorker = {
      startOnlyOnce: () => {},
      stop: () => {
        events.push('old.stop');
        resolveOldStopStarted?.();
        return new Promise<void>((release) => {
          releaseOldStop = release;
        });
      },
      get isDeprecated() {
        return true;
      },
      get isStopped() {
        return false;
      },
    } as unknown as Worker;

    let resolveReplacementStartup = () => {};
    let resolveFactoryStarted: (() => void) | null = null;
    const factoryStarted = new Promise<void>((resolve) => {
      resolveFactoryStarted = resolve;
    });

    const replacementWorker = {
      startOnlyOnce: () =>
        new Promise<void>((resolve) => {
          events.push('replacement.startOnlyOnce');
          resolveReplacementStartup = resolve;
        }),
      stop: () => {
        events.push('replacement.stop');
        return Promise.resolve();
      },
      get isDeprecated() {
        return false;
      },
      get isStopped() {
        return false;
      },
    } as unknown as Worker;

    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
    });
    const sql = (() => Promise.resolve([{ has_active: true }])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => {
      events.push('sql.end');
      return Promise.resolve();
    };

    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    (adapter as unknown as {
      queries: { markWorkerStopped: (workerId: string) => Promise<void> };
    }).queries.markWorkerStopped = (workerId) => {
      markedIds.push(workerId);
      return Promise.resolve();
    };

    let createCount = 0;
    await adapter.startWorker(() => {
      createCount++;
      if (createCount === 1) {
        return deprecatedWorker;
      }
      resolveFactoryStarted?.();
      return replacementWorker;
    });

    const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;
    const request = () =>
      new Request('http://localhost/functions/v1/my-worker', {
        headers: { authorization: 'Bearer test-service-key' },
      });
    await handler(request());

    const replacementResponse = handler(request());
    await oldStopStarted;

    const stopPromise = adapter.stopWorker();
    assertEquals(
      adapter.shutdownSignal.aborted,
      true,
      'stopWorker must abort the signal synchronously'
    );

    releaseOldStop();
    await factoryStarted;
    await new Promise((resolve) => setTimeout(resolve, 0));

    assertEquals(
      adapter.shutdownSignal.aborted,
      true,
      'replacement must not make the adapter signal live again during stop'
    );

    resolveReplacementStartup();
    const response = await replacementResponse;
    // Startup admission is permanently closed by stopPromise, so the
    // in-flight request must not report the replacement as running.
    assertEquals(response.status, 500);
    await stopPromise;

    assertEquals(markedIds.length, 2);
    assertEquals(markedIds[0], 'test-exec-id');
    assertEquals(markedIds[1] !== markedIds[0], true);
    assertEquals(events, [
      'old.stop',
      'replacement.startOnlyOnce',
      'replacement.stop',
      'sql.end',
    ]);
  },
});

Deno.test({
  name: 'stopWorker reports worker stop error when sql close also rejects',
  sanitizeResources: false,
  fn: async () => {
    const events: string[] = [];
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    (adapter as unknown as { worker: Worker | null }).worker = {
      startOnlyOnce: () => {},
      stop: () => {
        events.push('worker.stop');
        return Promise.reject(new Error('worker stop failed'));
      },
    } as unknown as Worker;

    let sqlEndCalls = 0;
    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      sqlEndCalls++;
      events.push('sql.end');
      return Promise.reject(new Error('sql close failed'));
    };

    await assertRejects(() => adapter.stopWorker(), Error, 'worker stop failed');

    assertEquals(events, ['worker.stop', 'sql.end']);
    assertEquals(sqlEndCalls, 1);
  },
});

Deno.test({
  name: 'stopWorker reports marking error when sql close also rejects',
  sanitizeResources: false,
  fn: async () => {
    const events: string[] = [];
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    (adapter as unknown as { worker: Worker | null }).worker = {
      startOnlyOnce: () => {},
      stop: () => {
        events.push('worker.stop');
        return Promise.resolve();
      },
    } as unknown as Worker;
    (adapter as unknown as { workerId: string | null }).workerId = 'worker-1';
    (adapter as unknown as {
      queries: { markWorkerStopped: (workerId: string) => Promise<void> };
    }).queries.markWorkerStopped = (_workerId) => {
      events.push('markWorkerStopped');
      return Promise.reject(new Error('mark failed'));
    };

    let sqlEndCalls = 0;
    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      sqlEndCalls++;
      events.push('sql.end');
      return Promise.reject(new Error('sql close failed'));
    };

    await assertRejects(() => adapter.stopWorker(), Error, 'mark failed');

    assertEquals(events, ['worker.stop', 'markWorkerStopped', 'sql.end']);
    assertEquals(sqlEndCalls, 1);
  },
});

Deno.test({
  name: 'stopWorker rejects with the sql close error when no earlier failure',
  sanitizeResources: false,
  fn: async () => {
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    let sqlEndCalls = 0;
    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      sqlEndCalls++;
      return Promise.reject(new Error('sql close failed'));
    };

    await assertRejects(() => adapter.stopWorker(), Error, 'sql close failed');
    assertEquals(sqlEndCalls, 1);
  },
});

Deno.test({
  name: 'replacement marks old worker stopped before starting replacement',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    const events: string[] = [];
    const workerIds: string[] = [];

    const deprecatedWorker = {
      startOnlyOnce: () => {},
      stop: () => {
        events.push('old.stop');
        return Promise.resolve();
      },
      get isDeprecated() {
        return true;
      },
      get isStopped() {
        return false;
      },
    } as unknown as Worker;

    const replacementWorker = {
      startOnlyOnce: () => {
        events.push('new.startOnlyOnce');
      },
      stop: () => Promise.resolve(),
      get isDeprecated() {
        return false;
      },
      get isStopped() {
        return false;
      },
    } as unknown as Worker;

    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
    });

    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = String.raw({ raw: strings }, ...values.map(String));
      if (query.includes('pgflow.mark_worker_stopped')) {
        events.push('markWorkerStopped');
        workerIds.push(values[0] as string);
      }
      return Promise.resolve([{ has_active: true }]);
    }) as unknown as { end: () => Promise<void> };
    sql.end = () => Promise.resolve();

    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    let createCount = 0;
    await adapter.startWorker(() => {
      createCount++;
      return createCount === 1 ? deprecatedWorker : replacementWorker;
    });

    const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;
    await handler(new Request('http://localhost/functions/v1/my-worker', {
      headers: { authorization: 'Bearer test-service-key' },
    }));

    const secondResponse = await handler(new Request('http://localhost/functions/v1/my-worker', {
      headers: { authorization: 'Bearer test-service-key' },
    })) as Response;

    assertEquals(secondResponse.status, 200);

    assertEquals(
      events,
      ['old.stop', 'markWorkerStopped', 'new.startOnlyOnce'],
      'Old worker should be stopped, marked stopped, then replacement started'
    );

    assertEquals(
      workerIds[0],
      'test-exec-id',
      'markWorkerStopped should be called with the old worker ID'
    );
  },
});

// ============================================================
// Startup Admission Serialization Tests (review follow-up)
// ============================================================

function authedRequest(): Request {
  return new Request('http://localhost/functions/v1/my-worker', {
    headers: { authorization: 'Bearer test-service-key' },
  });
}

Deno.test({
  name: 'second HTTP request waits for an in-flight startup instead of reporting running',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
    });
    const sql = (() => Promise.resolve([{ has_active: true }])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => Promise.resolve();

    let resolveStartup = () => {};
    let createCount = 0;
    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    await adapter.startWorker(() => {
      createCount++;
      return {
        startOnlyOnce: () =>
          new Promise<void>((resolve) => {
            resolveStartup = resolve;
          }),
        stop: () => Promise.resolve(),
        get isDeprecated() {
          return false;
        },
        get isStopped() {
          return false;
        },
      } as unknown as Worker;
    });

    const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;

    const firstResponse = handler(authedRequest());
    await new Promise((resolve) => setTimeout(resolve, 0));

    // replaceWorker() has published the worker, but startup is still pending.
    let secondSettled = false;
    const secondResponse = Promise.resolve(handler(authedRequest()));
    secondResponse.then(
      () => {
        secondSettled = true;
      },
      () => {
        secondSettled = true;
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    assertEquals(secondSettled, false, 'second request must wait for the in-flight startup');

    resolveStartup();
    const firstBody = await (await firstResponse).json();
    const secondBody = await (await secondResponse).json();

    assertEquals(firstBody.status, 'started');
    assertEquals(secondBody.status, 'running');
    assertEquals(createCount, 1, 'both requests must share one worker');
  },
});

Deno.test({
  name: 'shared startup rejection fails every waiting request',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
    });
    const sql = (() => Promise.resolve([{ has_active: true }])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => Promise.resolve();

    let rejectStartup = (_error: Error) => {};
    let createCount = 0;
    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    await adapter.startWorker(() => {
      createCount++;
      return {
        startOnlyOnce: () =>
          new Promise<void>((_resolve, reject) => {
            rejectStartup = reject;
          }),
        stop: () => Promise.resolve(),
        get isDeprecated() {
          return false;
        },
        get isStopped() {
          return false;
        },
      } as unknown as Worker;
    });

    const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;

    const firstResponse = handler(authedRequest());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const secondResponse = handler(authedRequest());
    await new Promise((resolve) => setTimeout(resolve, 0));

    rejectStartup(new Error('sensitive database details'));
    const first = await firstResponse;
    const second = await secondResponse;
    const firstBody = await first.text();
    const secondBody = await second.text();

    assertEquals(first.status, 500);
    assertEquals(second.status, 500);
    assertEquals(firstBody.includes('sensitive database details'), false);
    assertEquals(secondBody.includes('sensitive database details'), false);
    assertEquals(firstBody.includes('running'), false);
    assertEquals(secondBody.includes('running'), false);
    assertEquals(createCount, 1);
  },
});

Deno.test({
  name: 'HTTP request after shutdown begins fails without creating a worker',
  sanitizeResources: false,
  fn: async () => {
    let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
    let shutdownHandler: (() => void | Promise<void>) | null = null;
    const deps = createMockDeps({
      serve: (h) => {
        serveHandler = h;
      },
      onShutdown: (h) => {
        shutdownHandler = h;
      },
    });

    let releaseSqlEnd = () => {};
    let sqlEndCalls = 0;
    const sql = (() => Promise.resolve([{ has_active: true }])) as unknown as {
      end: () => Promise<void>;
    };
    sql.end = () => {
      sqlEndCalls++;
      return new Promise<void>((resolve) => {
        releaseSqlEnd = resolve;
      });
    };

    let createCount = 0;
    const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
    await adapter.startWorker(() => {
      createCount++;
      return createMockWorker();
    });

    const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;

    const shutdownPromise = shutdownHandler!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const response = await handler(authedRequest());

    assertEquals(response.status, 500);
    assertEquals(createCount, 0, 'no worker may be created after shutdown begins');

    releaseSqlEnd();
    await shutdownPromise;
    assertEquals(sqlEndCalls, 1);
  },
});

// ============================================================
// Bounded Shutdown Tests (review follow-up)
// ============================================================

Deno.test({
  name: 'stopWorker starts the drain before marking and closes sql only after both settle',
  sanitizeResources: false,
  fn: async () => {
    const events: string[] = [];
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    let releaseStop = () => {};
    let releaseMark = () => {};
    (adapter as unknown as { worker: Worker | null }).worker = {
      startOnlyOnce: () => {},
      stop: () => {
        events.push('worker.stop');
        return new Promise<void>((resolve) => {
          releaseStop = resolve;
        });
      },
    } as unknown as Worker;
    (adapter as unknown as { workerId: string | null }).workerId = 'worker-1';
    (adapter as unknown as {
      queries: { markWorkerStopped: (workerId: string) => Promise<void> };
    }).queries.markWorkerStopped = (_workerId) => {
      events.push('markWorkerStopped');
      return new Promise<void>((resolve) => {
        releaseMark = resolve;
      });
    };

    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      events.push('sql.end');
      return Promise.resolve();
    };

    const stopPromise = adapter.stopWorker();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assertEquals(
      events,
      ['worker.stop', 'markWorkerStopped'],
      'drain must start first and sql must stay open while both are pending'
    );

    releaseStop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertEquals(
      events,
      ['worker.stop', 'markWorkerStopped'],
      'sql must stay open until marking settles too'
    );

    releaseMark();
    await stopPromise;
    assertEquals(events, ['worker.stop', 'markWorkerStopped', 'sql.end']);
  },
});

Deno.test({
  name: 'stopWorker rejects with an AggregateError when drain and marking both fail',
  sanitizeResources: false,
  fn: async () => {
    const events: string[] = [];
    const deps = createMockDeps();
    const adapter = new SupabasePlatformAdapter(undefined, deps);

    (adapter as unknown as { worker: Worker | null }).worker = {
      startOnlyOnce: () => {},
      stop: () => {
        events.push('worker.stop');
        return Promise.reject(new Error('drain failed'));
      },
    } as unknown as Worker;
    (adapter as unknown as { workerId: string | null }).workerId = 'worker-1';
    (adapter as unknown as {
      queries: { markWorkerStopped: (workerId: string) => Promise<void> };
    }).queries.markWorkerStopped = (_workerId) => {
      events.push('markWorkerStopped');
      return Promise.reject(new Error('mark failed'));
    };

    const sql = adapter.sql as unknown as { end: () => Promise<void> };
    sql.end = () => {
      events.push('sql.end');
      return Promise.resolve();
    };

    const error = await assertRejects(() => adapter.stopWorker());

    assertInstanceOf(error, AggregateError);
    assertEquals(
      error.errors.map((e) => (e as Error).message),
      ['drain failed', 'mark failed'],
      'AggregateError must preserve both errors in drain-then-mark order'
    );
    assertEquals(events, ['worker.stop', 'markWorkerStopped', 'sql.end']);
  },
});

Deno.test({
  name: 'shutdown deadline force-closes sql when startup never settles',
  sanitizeResources: false,
  fn: async () => {
    const time = new FakeTime();
    try {
      let serveHandler: ((req: Request) => Response | Promise<Response>) | null = null;
      let shutdownHandler: (() => void | Promise<void>) | null = null;
      const deps = createMockDeps({
        serve: (h) => {
          serveHandler = h;
        },
        onShutdown: (h) => {
          shutdownHandler = h;
        },
      });

      const endCalls: unknown[] = [];
      const sql = (() => Promise.resolve([{ has_active: true }])) as unknown as {
        end: (options?: unknown) => Promise<void>;
      };
      sql.end = (options) => {
        endCalls.push(options);
        return Promise.resolve();
      };

      const adapter = new SupabasePlatformAdapter({ sql: sql as never }, deps);
      const warns: string[] = [];
      (adapter as unknown as {
        logger: { warn: (message: string) => void };
      }).logger.warn = (message) => {
        warns.push(message);
      };

      // Startup never settles, so shutdown can only finish via the deadline.
      const worker = {
        startOnlyOnce: () => new Promise<void>(() => undefined),
        stop: () => Promise.resolve(),
        get isDeprecated() {
          return false;
        },
        get isStopped() {
          return false;
        },
      } as unknown as Worker;
      await adapter.startWorker(() => worker);

      const handler = serveHandler as unknown as (req: Request) => Response | Promise<Response>;
      const responsePromise = Promise.resolve(handler(authedRequest()));
      await time.tickAsync(0);

      const shutdownPromise = Promise.resolve(shutdownHandler!());
      // Capture the rejection immediately: a transiently unhandled rejection
      // would fail the test runner before the assertions below.
      const shutdownError = shutdownPromise.then(
        () => new Error('expected shutdown to reject'),
        (error: unknown) => error
      );
      assertEquals(adapter.shutdownSignal.aborted, true);

      await time.tickAsync(5_000);
      await time.tickAsync(0);

      const error = (await shutdownError) as Error;
      assertStringIncludes(error.message, 'timed out after 5000ms');
      assertEquals(error instanceof Error && /5000ms/.test(error.message), true);
      assertEquals(endCalls, [{ timeout: 0 }], 'sql must be force-closed once at the deadline');
      assertEquals(warns.length, 1, 'the deadline expiry must be logged once');
      assertStringIncludes(warns[0], '5000');
      assertEquals(adapter.shutdownSignal.aborted, true, 'signal must stay aborted');

      let responseSettled = false;
      responsePromise.then(
        () => {
          responseSettled = true;
        },
        () => {
          responseSettled = true;
        }
      );
      await time.tickAsync(0);
      assertEquals(responseSettled, false, 'startup stays unresolved after the deadline');
      void shutdownPromise;
    } finally {
      time.restore();
    }
  },
});

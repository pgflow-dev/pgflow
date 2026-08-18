import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from '@std/assert';
import { ProcessPlatformAdapter } from '../../../src/platform/ProcessPlatformAdapter.ts';
import type { ProcessDeps, ProcessSignal } from '../../../src/platform/processDeps.ts';
import type postgres from 'postgres';

type SpyFn<TArgs extends unknown[], TResult> = ((...args: TArgs) => TResult) & {
  calls: TArgs[];
  implementation: (...args: TArgs) => TResult;
};

function createSpy<TArgs extends unknown[], TResult>(
  implementation: (...args: TArgs) => TResult
): SpyFn<TArgs, TResult> {
  const spy = ((...args: TArgs) => {
    spy.calls.push(args);
    return spy.implementation(...args);
  }) as SpyFn<TArgs, TResult>;
  spy.calls = [];
  spy.implementation = implementation;
  return spy;
}

type SqlStub = postgres.Sql & {
  calls: string[];
  end: SpyFn<[], Promise<void>>;
};

type WorkerStub = {
  startOnlyOnce: SpyFn<[unknown], Promise<void>>;
  stop: SpyFn<[], Promise<void>>;
  onDeprecated: SpyFn<[() => void], void>;
};

function createDeps(env: Record<string, string | undefined> = {}) {
  type SignalHandler = () => void | Promise<void>;
  const handlers = new Map<ProcessSignal, SignalHandler>();
  const offSignal = createSpy<[ProcessSignal, SignalHandler], void>(
    (signal, handler) => {
      if (handlers.get(signal) === handler) handlers.delete(signal);
    }
  );
  const exit = createSpy<[number], never>((code) => {
    throw new Error(`exit:${code}`);
  });
  const deps: ProcessDeps = {
    env,
    onSignal: (signal, handler) => {
      handlers.set(signal, handler);
    },
    offSignal,
    exit: exit as unknown as (code: number) => never,
    setExitCode: createSpy<[number], void>(() => undefined),
    randomUUID: createSpy<[], string>(() => '00000000-0000-4000-8000-000000000001'),
  };

  return { deps, handlers, exit, offSignal };
}

function createSqlStub(events?: string[]): SqlStub {
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    if (String.raw({ raw: strings }, ...values.map(String)).includes('pgflow.mark_worker_stopped')) {
      events?.push('markWorkerStopped');
    }
    sql.calls.push(String.raw({ raw: strings }, ...values.map(String)));
    return Promise.resolve([]);
  }) as SqlStub;
  sql.calls = [];
  sql.end = createSpy<[], Promise<void>>(() => Promise.resolve());
  return sql;
}

function createWorkerStub(): WorkerStub {
  return {
    startOnlyOnce: createSpy<[unknown], Promise<void>>(() => Promise.resolve()),
    stop: createSpy<[], Promise<void>>(() => Promise.resolve()),
    onDeprecated: createSpy<[() => void], void>(() => undefined),
  };
}

function validEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/postgres',
    ...overrides,
  };
}

Deno.test('ProcessPlatformAdapter throws when SUPABASE_URL is missing', () => {
  const { deps } = createDeps(validEnv({ SUPABASE_URL: undefined }));

  assertThrows(() => new ProcessPlatformAdapter(undefined, deps), Error, 'SUPABASE_URL');
});

Deno.test('ProcessPlatformAdapter throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
  const { deps } = createDeps(validEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }));

  assertThrows(
    () => new ProcessPlatformAdapter(undefined, deps),
    Error,
    'SUPABASE_SERVICE_ROLE_KEY'
  );
});

Deno.test('ProcessPlatformAdapter throws when no database source is available', () => {
  const { deps } = createDeps(validEnv({ DATABASE_URL: undefined }));

  assertThrows(
    () => new ProcessPlatformAdapter(undefined, deps),
    Error,
    'No database connection available'
  );
});

Deno.test('ProcessPlatformAdapter prefers DATABASE_URL when both database variables are set', async () => {
  const { deps } = createDeps(validEnv({
    DATABASE_URL: 'postgresql://process:5432/database',
    EDGE_WORKER_DB_URL: 'postgresql://edge:5432/database',
  }));
  const adapter = new ProcessPlatformAdapter(undefined, deps);

  assertEquals(adapter.connectionString, 'postgresql://process:5432/database');

  await adapter.stopWorker();
});

Deno.test('ProcessPlatformAdapter starts immediately with process start mode and generated worker id', async () => {
  const { deps } = createDeps(validEnv({ WORKER_NAME: 'emails' }));
  const sql = createSqlStub();
  const worker = createWorkerStub();
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  await adapter.startWorker(() => worker as never);

  assertEquals(worker.startOnlyOnce.calls, [[{
    edgeFunctionName: 'emails',
    workerId: '00000000-0000-4000-8000-000000000001',
    startMode: 'process',
  }]]);
});

Deno.test('ProcessPlatformAdapter defaults WORKER_NAME to pgflow-worker', async () => {
  const { deps } = createDeps(validEnv());
  const sql = createSqlStub();
  const worker = createWorkerStub();
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  await adapter.startWorker(() => worker as never);

  assertEquals(
    (worker.startOnlyOnce.calls[0]?.[0] as { edgeFunctionName?: string }).edgeFunctionName,
    'pgflow-worker'
  );
});

Deno.test('ProcessPlatformAdapter manual stop drains and keeps caller-provided sql open without exiting', async () => {
  const { deps, exit } = createDeps(validEnv());
  const sql = createSqlStub();
  const worker = createWorkerStub();
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  await adapter.startWorker(() => worker as never);
  await adapter.stopWorker();

  assertEquals(worker.stop.calls.length, 1);
  assertStringIncludes(sql.calls.at(-1) ?? '', 'pgflow.mark_worker_stopped');
  assertEquals(sql.end.calls.length, 0);
  assertEquals(exit.calls.length, 0);
});

Deno.test('ProcessPlatformAdapter manual stop marks stopped after drain', async () => {
  const { deps } = createDeps(validEnv());
  const events: string[] = [];
  const sql = createSqlStub(events);
  const worker = createWorkerStub();
  worker.stop.implementation = () => {
    events.push('worker.stop');
    return Promise.resolve();
  };
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  await adapter.startWorker(() => worker as never);
  await adapter.stopWorker();

  assertEquals(events, ['worker.stop', 'markWorkerStopped']);
});

Deno.test('ProcessPlatformAdapter signal-triggered stop exits with zero after drain', async () => {
  const { deps, handlers, exit } = createDeps(validEnv());
  const sql = createSqlStub();
  const worker = createWorkerStub();
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  await adapter.startWorker(() => worker as never);
  await assertRejects(async () => await handlers.get('SIGTERM')?.(), Error, 'exit:0');

  assertEquals(worker.stop.calls.length, 1);
  assertEquals((deps.setExitCode as SpyFn<[number], void>).calls, [[0]]);
  assertEquals(exit.calls, [[0]]);
});

Deno.test('ProcessPlatformAdapter second signal exits immediately with non-zero code', async () => {
  const { deps, handlers, exit } = createDeps(validEnv());
  const sql = createSqlStub();
  const worker = createWorkerStub();
  worker.stop.implementation = () => new Promise(() => undefined);
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  await adapter.startWorker(() => worker as never);
  const firstShutdown = handlers.get('SIGINT')?.();

  await assertRejects(async () => await handlers.get('SIGINT')?.(), Error, 'exit:1');
  void firstShutdown;
  assertEquals(exit.calls, [[1]]);
});

Deno.test('ProcessPlatformAdapter stop failure exits with non-zero code for signal shutdown', async () => {
  const { deps, handlers, exit } = createDeps(validEnv());
  const sql = createSqlStub();
  const worker = createWorkerStub();
  worker.stop.implementation = () => Promise.reject(new Error('drain failed'));
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  await adapter.startWorker(() => worker as never);
  await assertRejects(async () => await handlers.get('SIGQUIT')?.(), Error, 'exit:1');

  assertEquals((deps.setExitCode as SpyFn<[number], void>).calls, [[1]]);
  assertEquals(exit.calls, [[1]]);
});

Deno.test('ProcessPlatformAdapter concurrent stopWorker calls share one promise', async () => {
  const { deps } = createDeps(validEnv());
  const sql = createSqlStub();
  const worker = createWorkerStub();
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  await adapter.startWorker(() => worker as never);

  const p1 = adapter.stopWorker();
  const p2 = adapter.stopWorker();

  assertEquals(p1 === p2, true, 'Concurrent stopWorker calls should return same promise');

  await p1;
  assertEquals(worker.stop.calls.length, 1, 'worker.stop should be called once');
});

Deno.test('ProcessPlatformAdapter deprecation drains and exits zero', async () => {
  const { deps, exit } = createDeps(validEnv());
  const sql = createSqlStub();
  const worker = createWorkerStub();
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  await adapter.startWorker(() => worker as never);

  assertEquals(worker.onDeprecated.calls.length, 1, 'deprecation handler should be registered');

  const deprecationHandler = worker.onDeprecated.calls[0]?.[0];
  assertEquals(typeof deprecationHandler, 'function');

  deprecationHandler?.();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(worker.stop.calls.length, 1);
  assertEquals((deps.setExitCode as SpyFn<[number], void>).calls, [[0]]);
  assertEquals(exit.calls, [[0]]);
});

Deno.test('ProcessPlatformAdapter first signal during startup exits immediately with zero', async () => {
  const { deps, handlers, exit } = createDeps(validEnv());
  const sql = createSqlStub();
  const worker = createWorkerStub();
  worker.startOnlyOnce.implementation = () => new Promise<void>(() => undefined);
  const adapter = new ProcessPlatformAdapter({ sql }, deps);
  const end = createSpy<[], Promise<void>>(() => Promise.resolve());
  (adapter.sql as unknown as { end: typeof end }).end = end;

  const startupPromise = adapter.startWorker(() => worker as never);

  assertEquals(handlers.size, 3, 'Signal handlers must exist during startup');
  assertEquals(adapter.shutdownSignal.aborted, false);

  await assertRejects(async () => await handlers.get('SIGTERM')?.(), Error, 'exit:0');

  assertEquals(adapter.shutdownSignal.aborted, true, 'first signal must abort the shutdown signal');
  assertEquals((deps.setExitCode as SpyFn<[number], void>).calls, [[0]]);
  assertEquals(exit.calls, [[0]], 'exit must not wait for the hung startup');
  assertEquals(worker.stop.calls.length, 0, 'no worker drain before the hard exit');
  assertEquals(sql.calls.length, 0, 'no row marking before the hard exit');
  assertEquals(end.calls.length, 0, 'no owned-SQL cleanup before the hard exit');

  void startupPromise;
});

Deno.test('ProcessPlatformAdapter manual stop during startup waits for readiness without exiting', async () => {
  let resolveStartup = () => {};
  const { deps, exit } = createDeps(validEnv());
  const sql = createSqlStub();
  const worker = createWorkerStub();
  worker.startOnlyOnce.implementation = () => new Promise<void>((resolve) => {
    resolveStartup = resolve;
  });
  const adapter = new ProcessPlatformAdapter({ sql }, deps);

  const startupPromise = adapter.startWorker(() => worker as never);
  const stopPromise = adapter.stopWorker();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(worker.stop.calls.length, 0, 'manual stop must wait for startup');
  assertEquals(exit.calls.length, 0, 'manual stop must not exit the process');

  resolveStartup();
  await startupPromise;
  await stopPromise;

  assertEquals(worker.stop.calls.length, 1);
  assertStringIncludes(sql.calls.at(-1) ?? '', 'pgflow.mark_worker_stopped');
  assertEquals(exit.calls.length, 0);
});

Deno.test('ProcessPlatformAdapter startup failure cleans owned resources once', async () => {
  const { deps, handlers, offSignal } = createDeps(validEnv());
  const worker = createWorkerStub();
  worker.startOnlyOnce.implementation = () => Promise.reject(new Error('startup failed'));
  const adapter = new ProcessPlatformAdapter(undefined, deps);
  const end = createSpy<[], Promise<void>>(() => Promise.resolve());
  (adapter.sql as unknown as { end: typeof end }).end = end;

  await assertRejects(
    () => adapter.startWorker(() => worker as never),
    Error,
    'startup failed'
  );

  assertEquals(end.calls.length, 1);
  assertEquals(offSignal.calls.length, 3);
  assertEquals(handlers.size, 0);

  await assertRejects(() => adapter.stopWorker(), Error, 'startup failed');
  assertEquals(end.calls.length, 1);
  assertEquals(offSignal.calls.length, 3);
});

Deno.test('ProcessPlatformAdapter shutdown cleans owned resources once', async () => {
  const { deps, handlers, offSignal } = createDeps(validEnv());
  const worker = createWorkerStub();
  const adapter = new ProcessPlatformAdapter(undefined, deps);
  const end = createSpy<[], Promise<void>>(() => Promise.resolve());
  (adapter.sql as unknown as { end: typeof end }).end = end;
  const markWorkerStopped = createSpy<[string], Promise<void>>(() => Promise.resolve());
  (adapter as unknown as {
    queries: { markWorkerStopped: typeof markWorkerStopped };
  }).queries.markWorkerStopped = markWorkerStopped;

  await adapter.startWorker(() => worker as never);
  await adapter.stopWorker();
  await adapter.stopWorker();

  assertEquals(worker.stop.calls.length, 1);
  assertEquals(markWorkerStopped.calls.length, 1);
  assertEquals(end.calls.length, 1);
  assertEquals(offSignal.calls.length, 3);
  assertEquals(handlers.size, 0);
});

import type { PlatformAdapter } from '../../src/platform/types.ts';
import type { WorkerBootstrap, WorkerStartMode } from '../../src/core/types.ts';

const adapterWithoutRequestShutdown: PlatformAdapter = {
  async startWorker() {},
  async stopWorker() {},
  get connectionString() {
    return undefined;
  },
  get env() {
    return {};
  },
  get shutdownSignal() {
    return new AbortController().signal;
  },
  get platformResources() {
    return {};
  },
  get isLocalEnvironment() {
    return false;
  },
};

void adapterWithoutRequestShutdown;

const processMode: WorkerStartMode = 'process';

const processBootstrap: WorkerBootstrap = {
  edgeFunctionName: 'process-worker',
  workerId: 'worker-id',
  startMode: processMode,
};

void processBootstrap;

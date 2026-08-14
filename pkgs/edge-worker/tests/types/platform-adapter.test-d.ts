import type { PlatformAdapter } from '../../src/platform/types.ts';
import type {
  ILifecycle,
  WorkerBootstrap,
  WorkerStartMode,
} from '../../src/core/types.ts';

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

const legacyLifecycle: ILifecycle = {
  async acknowledgeStart(_workerBootstrap: WorkerBootstrap) {},
  acknowledgeStop() {},
  async sendHeartbeat() {},
  get edgeFunctionName() {
    return undefined;
  },
  get queueName() {
    return 'legacy-queue';
  },
  get isCreated() {
    return true;
  },
  get isRunning() {
    return false;
  },
  get isStopping() {
    return false;
  },
  get isStopped() {
    return false;
  },
  transitionToStopping() {},
};

void legacyLifecycle;

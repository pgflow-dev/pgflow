import type { PlatformAdapter } from '../../src/platform/types.ts';

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

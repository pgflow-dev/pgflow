import type { CreateLoggerFn, Logger } from '../src/platform/types.js';

const noop = () => {};

export const fakeLogger: Logger = {
  debug: noop,
  verbose: noop,
  info: noop,
  warn: noop,
  error: noop,
  // Structured logging methods
  taskStarted: noop,
  taskCompleted: noop,
  taskFailed: noop,
  polling: noop,
  taskCount: noop,
  startupBanner: noop,
  shutdown: noop,
};

export const createFakeLogger: CreateLoggerFn = (_module: string) => fakeLogger;

import type { CreateLoggerFn, Logger } from '../src/platform/types.js';

const noop = () => {};

export const fakeLogger: Logger = {
  debug: noop,
  verbose: noop,
  info: noop,
  warn: noop,
  error: noop,
};

export const createFakeLogger: CreateLoggerFn = (_module: string) => fakeLogger;

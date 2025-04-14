import type { CreateLoggerFn, Logger } from '../src/platform/types.js';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export const fakeLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

export const createFakeLogger: CreateLoggerFn = () => fakeLogger;

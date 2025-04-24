import type { CreateLoggerFn, Logger } from '../src/platform/types.js';

const noop = () => {};

export const fakeLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

export const createFakeLogger: CreateLoggerFn = () => fakeLogger;

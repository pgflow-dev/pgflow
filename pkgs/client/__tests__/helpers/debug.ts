/**
 * Debug logging utility for e2e tests.
 * Enable verbose output by setting DEBUG=1 or VERBOSE=1 environment variable.
 */
export const DEBUG = process.env.DEBUG === '1' || process.env.VERBOSE === '1';

export const log = (...args: unknown[]) => {
  if (DEBUG) {
    console.log(...args);
  }
};

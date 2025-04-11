import type { Logger } from './types.js';

/**
 * Creates a logging factory with dynamic workerId support
 */
export function createLoggingFactory() {
  // Shared state for all loggers
  let sharedWorkerId = 'unknown';
  let logLevel = 'info';

  // All created logger instances - using Map for efficient lookup
  const loggers: Map<string, Logger> = new Map();

  // Simple level filtering
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };

  /**
   * Creates a new logger for a specific module
   */
  const createLogger = (module: string): Logger => {
    // Create a logger that directly references the shared state
    const logger: Logger = {
      debug: (message, ...args) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.debug) {
          console.debug(
            `worker_id=${sharedWorkerId} module=${module} ${message}`,
            ...args
          );
        }
      },
      info: (message, ...args) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.info) {
          console.info(
            `worker_id=${sharedWorkerId} module=${module} ${message}`,
            ...args
          );
        }
      },
      warn: (message, ...args) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.warn) {
          console.warn(
            `worker_id=${sharedWorkerId} module=${module} ${message}`,
            ...args
          );
        }
      },
      error: (message, ...args) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.error) {
          console.error(
            `worker_id=${sharedWorkerId} module=${module} ${message}`,
            ...args
          );
        }
      },
    };

    // Store the logger in our registry using module as key
    loggers.set(module, logger);

    // Return the logger
    return logger;
  };

  /**
   * Updates the workerId for all loggers
   */
  const setWorkerId = (workerId: string): void => {
    sharedWorkerId = workerId;
  };

  /**
   * Updates the log level for all loggers
   */
  const setLogLevel = (newLogLevel: string): void => {
    logLevel = newLogLevel;
  };

  return {
    createLogger,
    setWorkerId,
    setLogLevel,
  };
}

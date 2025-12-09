import type { Logger } from './types.js';
import { isLocalSupabaseEnv } from '../shared/localDetection.js';

/**
 * Log format type: 'fancy' for local dev with colors/icons, 'simple' for hosted with key=value
 */
export type LogFormat = 'fancy' | 'simple';

/**
 * Environment record type for logging configuration
 */
export type LoggingEnv = Record<string, string | undefined>;

/**
 * Creates a logging factory with dynamic workerId support and environment-based configuration
 * @param env - Optional environment variables for auto-configuration (NO_COLOR, EDGE_WORKER_LOG_FORMAT, etc.)
 */
export function createLoggingFactory(env?: LoggingEnv) {
  // Determine if colors should be enabled (NO_COLOR standard: any value disables colors)
  const colorsEnabled = env?.NO_COLOR === undefined;

  // Determine if this is a local Supabase environment
  const isLocal = env ? isLocalSupabaseEnv(env) : false;

  // Determine log format: explicit override > auto-detect from environment
  const explicitFormat = env?.EDGE_WORKER_LOG_FORMAT as LogFormat | undefined;
  const format: LogFormat = explicitFormat ?? (isLocal ? 'fancy' : 'simple');

  // Determine log level: explicit override > environment-based default (local=verbose, hosted=info)
  const explicitLevel = env?.EDGE_WORKER_LOG_LEVEL;
  const defaultLevel = isLocal ? 'verbose' : 'info';
  let logLevel = explicitLevel ?? defaultLevel;

  // Shared state for all loggers
  let sharedWorkerId = 'unknown';

  // All created logger instances - using Map for efficient lookup
  const loggers: Map<string, Logger> = new Map();

  // Simple level filtering
  // Hierarchy: error < warn < info < verbose < debug
  const levels = { error: 0, warn: 1, info: 2, verbose: 3, debug: 4 };

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
          // Use console.log for debug messages since console.debug isn't available in Supabase
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
          // Use console.log for info messages since console.info isn't available in Supabase
          console.info(
            `worker_id=${sharedWorkerId} module=${module} ${message}`,
            ...args
          );
        }
      },
      verbose: (message, ...args) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.verbose) {
          // Use console.log for verbose messages
          console.log(
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
    // Expose configuration for inspection/testing
    get colorsEnabled() {
      return colorsEnabled;
    },
    get format() {
      return format;
    },
    get logLevel() {
      return logLevel;
    },
  };
}

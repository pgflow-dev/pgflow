import type { Logger, TaskLogContext, StartupContext } from './types.js';
import { isLocalSupabaseEnv } from '../shared/localDetection.js';

/**
 * Log format type: 'fancy' for local dev with colors/icons, 'simple' for hosted with key=value
 */
export type LogFormat = 'fancy' | 'simple';

/**
 * Environment record type for logging configuration
 */
export type LoggingEnv = Record<string, string | undefined>;

// ============================================================
// ANSI Color Codes (16-color safe palette)
// ============================================================

const ANSI = {
  // Colors
  blue: '\x1b[34m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  white: '\x1b[37m',

  // Formatting
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

/**
 * Apply ANSI color to text if colors are enabled
 */
function colorize(text: string, color: string, enabled: boolean): string {
  return enabled ? `${color}${text}${ANSI.reset}` : text;
}

// ============================================================
// Fancy Formatter (Local Dev) - Phase 3b
// ============================================================

class FancyFormatter {
  constructor(
    private colorsEnabled: boolean,
    private getWorkerName: () => string,
    private isDebugLevel: () => boolean
  ) {}

  private workerPrefix(workerName?: string): string {
    const name = workerName ?? this.getWorkerName();
    return colorize(`${name}:`, ANSI.blue, this.colorsEnabled);
  }

  private flowStepPath(flowSlug: string, stepSlug: string): string {
    return `${flowSlug}/${stepSlug}`;
  }

  private identifiers(ctx: TaskLogContext): string {
    // Only show identifiers at debug level (Phase 3b)
    if (!this.isDebugLevel()) return '';
    return colorize(
      `run_id=${ctx.runId} msg_id=${ctx.msgId} worker_id=${ctx.workerId}`,
      ANSI.dim,
      this.colorsEnabled
    );
  }

  taskStarted(ctx: TaskLogContext): string {
    const prefix = this.workerPrefix(ctx.workerName);
    const icon = colorize('›', ANSI.dim, this.colorsEnabled);
    const path = colorize(this.flowStepPath(ctx.flowSlug, ctx.stepSlug), ANSI.dim, this.colorsEnabled);
    const ids = this.identifiers(ctx);

    const parts = [prefix, icon, path];
    if (ids) parts.push(ids);
    return parts.join(' ');
  }

  taskCompleted(ctx: TaskLogContext, durationMs: number): string {
    const prefix = this.workerPrefix(ctx.workerName);
    const icon = colorize('✓', ANSI.green, this.colorsEnabled);
    const path = colorize(this.flowStepPath(ctx.flowSlug, ctx.stepSlug), ANSI.green, this.colorsEnabled);
    const duration = `${durationMs}ms`;

    // Add retry info if present
    const retryInfo = ctx.retryAttempt && ctx.retryAttempt > 1
      ? colorize(`retry ${ctx.retryAttempt - 1}`, ANSI.dim, this.colorsEnabled)
      : '';

    const ids = this.identifiers(ctx);

    const parts = [prefix, icon, path, duration];
    if (retryInfo) parts.push(retryInfo);
    if (ids) parts.push(ids);

    return parts.join('  ');
  }

  taskFailed(ctx: TaskLogContext, error: Error): string {
    const prefix = this.workerPrefix(ctx.workerName);
    const icon = colorize('✗', ANSI.red, this.colorsEnabled);
    const path = colorize(this.flowStepPath(ctx.flowSlug, ctx.stepSlug), ANSI.red, this.colorsEnabled);
    const errorMsg = colorize(error.message, ANSI.red, this.colorsEnabled);
    const ids = this.identifiers(ctx);

    let result = `${prefix} ${icon} ${path}`;
    if (ids) result += `  ${ids}`;
    result += `\n${prefix}   ${errorMsg}`;
    return result;
  }

  polling(): string {
    const prefix = this.workerPrefix();
    return `${prefix} Polling...`;
  }

  taskCount(count: number): string {
    const prefix = this.workerPrefix();

    if (count === 0) {
      const message = colorize('No tasks', ANSI.dim, this.colorsEnabled);
      return `${prefix} ${message}`;
    }

    return `${prefix} Starting ${colorize(count.toString(), ANSI.white, this.colorsEnabled)} tasks`;
  }

  startupBanner(ctx: StartupContext): string[] {
    const arrow = colorize('➜', ANSI.green, this.colorsEnabled);
    const workerName = colorize(ctx.workerName, ANSI.bold, this.colorsEnabled);
    const workerId = colorize(`[${ctx.workerId}]`, ANSI.dim, this.colorsEnabled);

    const lines: string[] = [
      `${arrow} ${workerName} ${workerId}`,
      `   Queue: ${ctx.queueName}`,
    ];

    // Multi-flow banner with aligned list (Phase 3b)
    ctx.flows.forEach((flow, index) => {
      const statusIcon = flow.compilationStatus === 'compiled' || flow.compilationStatus === 'verified'
        ? colorize('✓', ANSI.green, this.colorsEnabled)
        : colorize('!', ANSI.yellow, this.colorsEnabled);

      const statusText = colorize(`(${flow.compilationStatus})`, ANSI.dim, this.colorsEnabled);
      const label = index === 0 ? '   Flows:' : '         ';
      lines.push(`${label} ${statusIcon} ${flow.flowSlug} ${statusText}`);
    });

    return lines;
  }

  shutdown(phase: 'deprecating' | 'waiting' | 'stopped'): string {
    const prefix = this.workerPrefix();
    const icon = colorize('ℹ', ANSI.blue, this.colorsEnabled);

    if (phase === 'deprecating') {
      return `${prefix} ${icon} Marked for deprecation\n${prefix}   -> Stopped accepting new messages`;
    } else if (phase === 'waiting') {
      return `${prefix}   -> Waiting for pending tasks...`;
    } else {
      const checkmark = colorize('✓', ANSI.green, this.colorsEnabled);
      return `${prefix} ${checkmark} Stopped gracefully`;
    }
  }
}

// ============================================================
// Simple Formatter (Hosted) - Phase 3b
// ============================================================

class SimpleFormatter {
  constructor(private getWorkerName: () => string) {}

  taskStarted(ctx: TaskLogContext): string {
    // Phase 3b: worker=X queue=Y flow=Z step=W format
    return `[DEBUG] worker=${ctx.workerName} queue=${ctx.queueName} flow=${ctx.flowSlug} step=${ctx.stepSlug} status=started run_id=${ctx.runId} msg_id=${ctx.msgId} worker_id=${ctx.workerId}`;
  }

  taskCompleted(ctx: TaskLogContext, durationMs: number): string {
    const retry = ctx.retryAttempt && ctx.retryAttempt > 1 ? ` retry_attempt=${ctx.retryAttempt}` : '';
    // Phase 3b: worker=X queue=Y flow=Z step=W format
    return `[VERBOSE] worker=${ctx.workerName} queue=${ctx.queueName} flow=${ctx.flowSlug} step=${ctx.stepSlug} status=completed duration_ms=${durationMs} run_id=${ctx.runId} msg_id=${ctx.msgId} worker_id=${ctx.workerId}${retry}`;
  }

  taskFailed(ctx: TaskLogContext, error: Error): string {
    // Phase 3b: worker=X queue=Y flow=Z step=W format
    return `[VERBOSE] worker=${ctx.workerName} queue=${ctx.queueName} flow=${ctx.flowSlug} step=${ctx.stepSlug} status=failed error="${error.message}" run_id=${ctx.runId} msg_id=${ctx.msgId} worker_id=${ctx.workerId}`;
  }

  polling(): string {
    return `[VERBOSE] worker=${this.getWorkerName()} status=polling`;
  }

  taskCount(count: number): string {
    if (count === 0) {
      return `[VERBOSE] worker=${this.getWorkerName()} status=no_tasks`;
    }
    return `[VERBOSE] worker=${this.getWorkerName()} status=starting task_count=${count}`;
  }

  startupBanner(ctx: StartupContext): string[] {
    // Phase 3b: Multi-flow support
    const lines: string[] = [];
    for (const flow of ctx.flows) {
      lines.push(`[INFO] worker=${ctx.workerName} queue=${ctx.queueName} flow=${flow.flowSlug} status=${flow.compilationStatus} worker_id=${ctx.workerId}`);
    }
    return lines;
  }

  shutdown(phase: 'deprecating' | 'waiting' | 'stopped'): string {
    if (phase === 'deprecating') {
      return `[INFO] worker=${this.getWorkerName()} status=deprecating`;
    } else if (phase === 'waiting') {
      return `[INFO] worker=${this.getWorkerName()} status=waiting`;
    } else {
      return `[INFO] worker=${this.getWorkerName()} status=stopped`;
    }
  }
}

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
  let sharedWorkerName = 'unknown';

  // All created logger instances - using Map for efficient lookup
  const loggers: Map<string, Logger> = new Map();

  // Simple level filtering
  // Hierarchy: error < warn < info < verbose < debug
  const levels = { error: 0, warn: 1, info: 2, verbose: 3, debug: 4 };

  // Helper to check if current log level is debug
  const isDebugLevel = () => {
    const levelValue = levels[logLevel as keyof typeof levels] ?? levels.info;
    return levelValue >= levels.debug;
  };

  // Helper to get worker name
  const getWorkerName = () => sharedWorkerName;

  // Create formatter instance based on format
  const formatter = format === 'fancy'
    ? new FancyFormatter(colorsEnabled, getWorkerName, isDebugLevel)
    : new SimpleFormatter(getWorkerName);

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

      // Structured logging methods
      taskStarted: (ctx: TaskLogContext) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.debug) {
          console.debug(formatter.taskStarted(ctx));
        }
      },

      taskCompleted: (ctx: TaskLogContext, durationMs: number) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.verbose) {
          console.log(formatter.taskCompleted(ctx, durationMs));
        }
      },

      taskFailed: (ctx: TaskLogContext, error: Error) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.verbose) {
          console.log(formatter.taskFailed(ctx, error));
        }
      },

      polling: () => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.verbose) {
          console.log(formatter.polling());
        }
      },

      taskCount: (count: number) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.verbose) {
          console.log(formatter.taskCount(count));
        }
      },

      startupBanner: (ctx: StartupContext) => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.info) {
          const lines = formatter.startupBanner(ctx);
          lines.forEach(line => console.info(line));
        }
      },

      shutdown: (phase: 'deprecating' | 'waiting' | 'stopped') => {
        const levelValue =
          levels[logLevel as keyof typeof levels] ?? levels.info;
        if (levelValue >= levels.info) {
          console.info(formatter.shutdown(phase));
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
   * Updates the worker name for all loggers (Phase 3b)
   */
  const setWorkerName = (workerName: string): void => {
    sharedWorkerName = workerName;
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
    setWorkerName,
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

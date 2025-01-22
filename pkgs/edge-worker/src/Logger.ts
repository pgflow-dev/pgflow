import * as log from 'jsr:@std/log';

function getLogLevelFromEnv(): log.LevelName {
  const validLevels = [
    // 'NOTSET',
    'DEBUG',
    'INFO',
    // 'WARNING',
    'ERROR',
    // 'CRITICAL',
  ];
  const logLevel = Deno.env.get('EDGE_WORKER_LOG_LEVEL')?.toUpperCase();

  if (logLevel && !validLevels.includes(logLevel)) {
    console.warn(`Invalid log level "${logLevel}". Using "INFO" instead.`);
    return 'INFO';
  }

  return (logLevel as log.LevelName) || 'INFO';
}

const defaultLoggerConfig: log.LoggerConfig = {
  level: 'DEBUG',
  handlers: ['console'],
};

export function setupLogger(workerId: string) {
  log.setup({
    handlers: {
      console: new log.ConsoleHandler(getLogLevelFromEnv(), {
        formatter: (record: {
          loggerName: string;
          msg: string;
          args: any[];
        }) => {
          const prefix = `worker_id=${workerId}`;
          const module = record.loggerName;
          const msg = record.msg;

          // If there are additional args, pretty print them using console.log
          if (record.args.length > 0) {
            return `${prefix} [${module}] ${msg}`;
          }

          return `${prefix} [${module}] ${msg}`;
        },
        useColors: true,
      }),
    },

    loggers: {
      BatchArchiver: defaultLoggerConfig,
      BatchProcessor: defaultLoggerConfig,
      EdgeWorker: defaultLoggerConfig,
      ExecutionController: defaultLoggerConfig,
      Heartbeat: defaultLoggerConfig,
      Logger: defaultLoggerConfig,
      MessageExecutor: defaultLoggerConfig,
      Worker: defaultLoggerConfig,
      WorkerLifecycle: defaultLoggerConfig,
      WorkerState: defaultLoggerConfig,
      spawnNewEdgeFunction: defaultLoggerConfig,
    },
  });
}

// Helper function to get logger for specific module
export function getLogger(module: string) {
  return log.getLogger(module);
}

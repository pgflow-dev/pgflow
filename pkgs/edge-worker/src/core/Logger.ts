import pino from 'pino';

function getLogLevelFromEnv(): pino.LevelWithSilent {
  const validLevels = ['DEBUG', 'INFO', 'ERROR'];
  const logLevel = Deno.env.get('EDGE_WORKER_LOG_LEVEL')?.toUpperCase();

  if (logLevel && !validLevels.includes(logLevel)) {
    console.warn(`Invalid log level "${logLevel}". Using "INFO" instead.`);
    return 'info';
  }

  return (logLevel?.toLowerCase() as pino.LevelWithSilent) || 'info';
}

// Store the root logger instance
let rootLogger: pino.Logger;

export function setupLogger(workerId: string) {
  const level = getLogLevelFromEnv();

  const loggerOptions: pino.LoggerOptions = {
    level,
    formatters: {
      bindings: () => ({ worker_id: workerId }),
    },
    serializers: pino.stdSerializers,
    // Remove the transport configuration that's causing issues in Deno
    // transport: {
    //   target: 'pino-pretty',
    //   options: {
    //     colorize: true,
    //     messageFormat: '[{module}] {msg}',
    //   }
    // }
  };

  // Create and store the root logger
  rootLogger = pino(loggerOptions);
  return rootLogger;
}

export function getLogger(module: string) {
  // Use the root logger if it exists, otherwise create a new one
  const logger = rootLogger || pino();
  return logger.child({ module });
}

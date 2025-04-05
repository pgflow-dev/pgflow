import pino from 'pino';

function getLogLevelFromEnv(): pino.LevelWithSilent {
  const validLevels = [
    'DEBUG',
    'INFO',
    'ERROR',
  ];
  const logLevel = Deno.env.get('EDGE_WORKER_LOG_LEVEL')?.toUpperCase();

  if (logLevel && !validLevels.includes(logLevel)) {
    console.warn(`Invalid log level "${logLevel}". Using "INFO" instead.`);
    return 'info';
  }

  return (logLevel?.toLowerCase() as pino.LevelWithSilent) || 'info';
}

export function setupLogger(workerId: string) {
  const level = getLogLevelFromEnv();
  
  const loggerOptions: pino.LoggerOptions = {
    level,
    formatters: {
      bindings: () => ({ worker_id: workerId }),
    },
    serializers: pino.stdSerializers,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        messageFormat: '[{module}] {msg}',
      }
    }
  };

  pino(loggerOptions);
}

export function getLogger(module: string) {
  return pino().child({ module });
}

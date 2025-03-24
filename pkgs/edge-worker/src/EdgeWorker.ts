import type { Worker } from './Worker.ts';
import spawnNewEdgeFunction from './spawnNewEdgeFunction.ts';
import type { Json, MessageRecord } from './types.ts';
import { getLogger, setupLogger } from './Logger.ts';
import { createPgmqWorker } from './factories/createPgmqWorker.ts';
import type { PgmqWorkerConfig } from './factories/createPgmqWorker.ts';

export type EdgeWorkerConfig = PgmqWorkerConfig & {
  /**
   * Optional database connection string. If not provided, it will be read from EDGE_WORKER_DB_URL environment variable.
   */
  connectionString?: string;
};

export class EdgeWorker {
  private static logger = getLogger('EdgeWorker');
  private static wasCalled = false;

  static start<MessagePayload extends Json = Json>(
    handler: (message: MessagePayload) => Promise<void> | void,
    config: EdgeWorkerConfig = {}
  ) {
    this.ensureFirstCall();

    // If connectionString is not provided in config, get it from environment
    const connectionString = config.connectionString || this.getConnectionStringFromEnv();

    this.setupRequestHandler(handler, {
      ...config,
      connectionString
    });
  }

  private static ensureFirstCall() {
    if (this.wasCalled) {
      throw new Error('EdgeWorker.start() can only be called once');
    }
    this.wasCalled = true;
  }

  private static getConnectionStringFromEnv(): string {
    // @ts-ignore - TODO: fix the types
    const connectionString = Deno.env.get('EDGE_WORKER_DB_URL');
    if (!connectionString) {
      const message =
        'EDGE_WORKER_DB_URL is not set!\n' +
        'See https://pgflow.pages.dev/edge-worker/prepare-environment/#prepare-connection-string';
      throw new Error(message);
    }
    return connectionString;
  }

  private static setupShutdownHandler(
    worker: Worker<MessageRecord<Json>>
  ) {
    globalThis.onbeforeunload = async () => {
      if (worker.edgeFunctionName) {
        await spawnNewEdgeFunction(worker.edgeFunctionName);
      }

      worker.stop();
    };

    // use waitUntil to prevent the function from exiting
    // @ts-ignore: TODO: fix the types
    EdgeRuntime.waitUntil(new Promise(() => {}));
  }

  private static setupRequestHandler<MessagePayload extends Json>(
    handler: (message: MessagePayload) => Promise<void> | void,
    config: EdgeWorkerConfig
  ) {
    let worker: Worker<MessageRecord<MessagePayload>> | null = null;

    Deno.serve({}, (req) => {
      if (!worker) {
        const edgeFunctionName = this.extractFunctionName(req);
        const sbExecutionId = Deno.env.get('SB_EXECUTION_ID')!;
        setupLogger(sbExecutionId);

        this.logger.info(`HTTP Request: ${edgeFunctionName}`);

        worker = createPgmqWorker(handler, {
          queueName: config.queueName || 'tasks',
          ...config,
        });

        worker.startOnlyOnce({
          edgeFunctionName,
          workerId: sbExecutionId,
        });

        this.setupShutdownHandler(worker);
      }

      return new Response('ok', {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  private static extractFunctionName(req: Request): string {
    return new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
  }
}

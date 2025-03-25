import type { Worker } from './Worker.ts';
import spawnNewEdgeFunction from './spawnNewEdgeFunction.ts';
import type { Json } from './types.ts';
import { getLogger, setupLogger } from './Logger.ts';
import { createQueueWorker } from './createQueueWorker.ts';

export type EdgeWorkerConfig = {
  /**
   * PostgreSQL connection string.
   * If not provided, it will be read from the EDGE_WORKER_DB_URL environment variable.
   */
  connectionString?: string;
  /**
   * Number of retry attempts for failed message processing
   * @default 5
   */
  retryLimit?: number;
  /**
   * Delay in seconds between retry attempts
   * @default 5
   */
  retryDelay?: number;
};

export class EdgeWorker {
  private static logger = getLogger('EdgeWorker');
  private static wasCalled = false;

  static start<MessagePayload extends Json = Json>(
    handler: (message: MessagePayload) => Promise<void> | void,
    config: EdgeWorkerConfig = {}
  ) {
    this.ensureFirstCall();

    const connectionString = config.connectionString || this.getConnectionString();
    const retryLimit = config.retryLimit ?? 5;
    const retryDelay = config.retryDelay ?? 5;
    this.setupRequestHandler(handler, {
      ...config,
      connectionString,
      retryLimit,
      retryDelay
    });
  }

  private static ensureFirstCall() {
    if (this.wasCalled) {
      throw new Error('EdgeWorker.start() can only be called once');
    }
    this.wasCalled = true;
  }

  private static getConnectionString(): string {
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
    worker: Worker
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
    workerConfig: EdgeWorkerConfig & {
      connectionString: string;
      retryLimit: number;
      retryDelay: number;
    }
  ) {
    let worker: Worker | null = null;

    Deno.serve({}, (req) => {
      if (!worker) {
        const edgeFunctionName = this.extractFunctionName(req);
        const sbExecutionId = Deno.env.get('SB_EXECUTION_ID')!;
        setupLogger(sbExecutionId);

        this.logger.info(`HTTP Request: ${edgeFunctionName}`);

        worker = createQueueWorker(handler, workerConfig);
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

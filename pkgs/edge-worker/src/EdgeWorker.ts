import type { Worker, WorkerConfig } from './Worker.ts';
import spawnNewEdgeFunction from './spawnNewEdgeFunction.ts';
import type { Json } from './types.ts';
import { getLogger, setupLogger } from './Logger.ts';
import postgres from 'postgres';
import { createQueueWorker } from './createQueueWorker.ts';

export type EdgeWorkerConfig = Omit<WorkerConfig, 'sql'> & {
  /**
   * PostgreSQL connection string.
   * If not provided, it will be read from the EDGE_WORKER_DB_URL environment variable.
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

    const connectionString = config.connectionString || this.getConnectionString();
    const sql = postgres(connectionString, {
      max: config.maxPgConnections,
      prepare: false,
    });

    const workerConfig: WorkerConfig = {
      ...config,
      sql
    };
    this.setupRequestHandler(handler, workerConfig);
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

  private static setupShutdownHandler<MessagePayload extends Json>(
    worker: Worker<MessagePayload>
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
    workerConfig: WorkerConfig
  ) {
    let worker: Worker<MessagePayload> | null = null;

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

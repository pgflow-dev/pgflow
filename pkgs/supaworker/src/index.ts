import { Worker, WorkerConfig } from './Worker.ts';
import spawnNewEdgeFunction from './spawnNewEdgeFunction.ts';
import { Json } from './types.ts';

export type EdgeWorkerConfig = Omit<WorkerConfig, 'connectionString'>;

export class EdgeWorker {
  private static wasCalled = false;

  static start<MessagePayload extends Json = Json>(
    handler: (message: MessagePayload) => Promise<unknown> | unknown,
    config: EdgeWorkerConfig = {}
  ) {
    this.ensureFirstCall();
    const connectionString = this.getConnectionString();

    const worker = this.initializeWorker(handler, {
      ...config,
      connectionString,
    });

    this.setupShutdownHandler(worker);
    this.setupRequestHandler(worker);
  }

  private static ensureFirstCall() {
    if (this.wasCalled) {
      throw new Error('EdgeWorker can only be called once');
    }
    this.wasCalled = true;
  }

  private static getConnectionString(): string {
    // @ts-ignore - TODO: fix the types
    const connectionString = Deno.env.get('DB_POOL_URL');
    if (!connectionString) {
      throw new Error('DB_POOL_URL is not set');
    }
    return connectionString;
  }

  private static initializeWorker<MessagePayload extends Json>(
    handler: (message: MessagePayload) => Promise<unknown> | unknown,
    config: WorkerConfig
  ): Worker<MessagePayload> {
    return new Worker<MessagePayload>(
      async (message) => {
        await handler(message);
      },
      {
        queueName: config.queueName || 'tasks',
        ...config,
      }
    );
  }

  private static setupShutdownHandler<MessagePayload extends Json>(
    worker: Worker<MessagePayload>
  ) {
    globalThis.onbeforeunload = () => {
      worker.stop();

      if (worker.edgeFunctionName) {
        spawnNewEdgeFunction(worker.edgeFunctionName);
      }
    };

    // use waitUntil to prevent the function from exiting
    // @ts-ignore: TODO: fix the types
    EdgeRuntime.waitUntil(new Promise(() => {}));
  }

  private static setupRequestHandler<MessagePayload extends Json>(
    worker: Worker<MessagePayload>
  ) {
    Deno.serve({}, (req) => {
      const edgeFunctionName = this.extractFunctionName(req);

      worker.startOnlyOnce({
        edgeFunctionName,
        workerId: Deno.env.get('SB_EXECUTION_ID')!,
      });

      console.log(`HTTP Request: ${edgeFunctionName}`);
      return new Response('ok', {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  private static extractFunctionName(req: Request): string {
    return new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
  }
}


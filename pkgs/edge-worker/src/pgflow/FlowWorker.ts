import { getLogger, setupLogger } from '../Logger.ts';
import spawnNewEdgeFunction from '../spawnNewEdgeFunction.ts';
import type { FlowDefinition, FlowWorkerConfig } from './types.ts';
import { createFlowWorker } from './createFlowWorker.ts';
import type { Json } from '../types.ts';

export class FlowWorker {
  private static logger = getLogger('FlowWorker');
  private static wasCalled = false;

  /**
   * Start a flow worker
   *
   * @param flow The flow definition to execute
   * @param config Configuration options for the worker
   */
  static start<RunPayload extends Json>(
    flow: FlowDefinition<RunPayload>,
    config: FlowWorkerConfig = {}
  ): void {
    this.ensureFirstCall();

    // If connectionString is not provided in config, get it from environment
    const connectionString = config.connectionString || this.getConnectionStringFromEnv();

    this.setupRequestHandler(flow, {
      ...config,
      connectionString
    });
  }

  /**
   * Ensure that start() is only called once
   */
  private static ensureFirstCall(): void {
    if (this.wasCalled) {
      throw new Error('FlowWorker.start() can only be called once');
    }
    this.wasCalled = true;
  }

  /**
   * Get the connection string from environment variables
   */
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

  /**
   * Set up the shutdown handler for the worker
   */
  private static setupShutdownHandler(worker: ReturnType<typeof createFlowWorker>): void {
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

  /**
   * Set up the request handler for the worker
   */
  private static setupRequestHandler<RunPayload extends Json>(
    flow: FlowDefinition<RunPayload>,
    config: FlowWorkerConfig
  ): void {
    let worker: ReturnType<typeof createFlowWorker> | null = null;

    Deno.serve({}, (req) => {
      if (!worker) {
        const edgeFunctionName = this.extractFunctionName(req);
        const sbExecutionId = Deno.env.get('SB_EXECUTION_ID')!;
        setupLogger(sbExecutionId);

        this.logger.info(`HTTP Request: ${edgeFunctionName}`);

        worker = createFlowWorker(flow, config);

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

  /**
   * Extract the function name from the request URL
   */
  private static extractFunctionName(req: Request): string {
    return new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
  }
}

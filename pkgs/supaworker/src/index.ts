import { Worker, WorkerConfig } from './Worker.ts';
import spawnNewEdgeFunction from './spawnNewEdgeFunction.ts';
import { Json } from './types.ts';

/**
 * Extracts the edge function name from the request URL
 */
function extractFunctionName(req: Request) {
  return new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
}

export type SupaworkerConfig = Omit<WorkerConfig, 'connectionString'>;

export class Supaworker {
  private static wasCalled = false;

  static start<MessagePayload extends Json = Json>(
    handler: (message: MessagePayload) => Promise<unknown> | unknown,
    config: SupaworkerConfig = {}
  ) {
    if (this.wasCalled) {
      throw new Error('Supaworker can only be called once');
    }
    this.wasCalled = true;

    // @ts-ignore - TODO: fix the types
    const DB_POOL_URL = Deno.env.get('DB_POOL_URL');

    if (!DB_POOL_URL) {
      throw new Error('DB_POOL_URL is not set');
    }

    const worker = new Worker<MessagePayload>(
      async (message) => {
        await handler(message);
      },
      {
        connectionString: DB_POOL_URL,
        queueName: config.queueName || 'tasks',
        ...config,
      }
    );

    globalThis.onbeforeunload = () => {
      worker.stop();

      if (worker.edgeFunctionName) {
        spawnNewEdgeFunction(worker.edgeFunctionName);
      }
    };

    // use waitUntil to prevent the function from exiting
    // @ts-ignore: TODO: fix the types
    EdgeRuntime.waitUntil(new Promise(() => {}));

    Deno.serve((req) => {
      const edgeFunctionName = extractFunctionName(req);

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
}

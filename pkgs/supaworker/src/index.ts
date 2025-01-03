import { Worker, WorkerConfig } from "../_supaworker/Worker.ts";
import spawnNewEdgeFunction from "../_supaworker/spawnNewEdgeFunction.ts";
import { Json } from "./types.ts";

export type SupaworkerConfig = Partial<Omit<WorkerConfig, "connectionString">>;

export class Supaworker {
  private static wasCalled = false;

  static start<MessagePayload extends Json = Json>(
    handler: (message: MessagePayload) => Promise<any> | any,
    config: SupaworkerConfig = {},
  ) {
    if (this.wasCalled) {
      throw new Error("Supaworker can only be called once");
    }
    this.wasCalled = true;

    // @ts-ignore - TODO: fix the types
    const DB_POOL_URL = Deno.env.get("DB_POOL_URL");

    if (!DB_POOL_URL) {
      throw new Error("DB_POOL_URL is not set");
    }

    const worker = new Worker<MessagePayload>({
      connectionString: DB_POOL_URL,
      queueName: config.queueName || "pgflow",
      ...config,
    });

    globalThis.onbeforeunload = () => {
      worker.stop();
      spawnNewEdgeFunction("pgflow-worker-2");
    };

    worker.startAndWait(async (message) => {
      await handler(message);
    });

    Deno.serve((_req) => {
      console.log("HTTP Request...");
      return new Response("ok", {
        headers: { "Content-Type": "application/json" },
      });
    });
  }
}

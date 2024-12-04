import { type Json } from "../_pgflow/index.ts";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import {
  handleInput,
  startStepTask,
  completeStepTask,
  failStepTask,
} from "../_pgflow/index.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";

const supabase = createServiceRoleClient();

export class BackgroundTaskEvent extends Event {
  readonly taskPromise: Promise<Json>;
  readonly input: EdgeFnInput;

  constructor(taskPromise: Promise<Json>, input: EdgeFnInput) {
    super("pgflow");
    this.taskPromise = taskPromise;
    this.input = input;
  }
}

globalThis.addEventListener("pgflow", async (event) => {
  const { taskPromise, input } = event as BackgroundTaskEvent;
  let result: Json;

  await startStepTask(input, supabase);

  try {
    result = await taskPromise;
  } catch (error: unknown) {
    // TODO: handle potential error from failStepTask call
    const errorToReport =
      error instanceof Error ? error : new Error(String(error));
    return await failStepTask(input, errorToReport, supabase);
  }

  // TODO: handle potential error from completeStepTask call
  return await completeStepTask(input, result, supabase);
});

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();
  const { meta, payload } = input;

  const taskPromise = handleInput(meta, payload);

  globalThis.dispatchEvent(new BackgroundTaskEvent(taskPromise, input));

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

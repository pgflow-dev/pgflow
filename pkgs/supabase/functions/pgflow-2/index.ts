/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import handleInput, { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import completeStep from "../_pgflow/completeStep.ts";
import failStep from "../_pgflow/failStep.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";

const supabase = createServiceRoleClient();

export class BackgroundTaskEvent extends Event {
  readonly taskPromise: Promise<any>;

  constructor(taskPromise: Promise<any>) {
    super("pgflow");
    this.taskPromise = taskPromise;
  }
}

async function performTask({ meta, payload }: EdgeFnInput) {
  let stepResult: any;

  try {
    stepResult = await handleInput(meta, payload);
    console.log("Event Listener RESULT", stepResult);
  } catch (error) {
    const failStepResult = await failStep(meta, error, supabase);
    console.log("Event Listener FAIL", error, failStepResult);

    return failStepResult;
  }

  const completeStepResult = await completeStep(meta, stepResult, supabase);
  console.log("Event Listener COMPLETE", completeStepResult);

  return completeStepResult;
}

globalThis.addEventListener("pgflow", async (event) => {
  const taskPromise = (event as BackgroundTaskEvent).taskPromise;

  try {
    const result = await taskPromise;
    console.log("Task completed:", result);
  } catch (error) {
    console.error("Task failed:", error);
  }
});

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();

  const taskPromise = performTask(input);

  globalThis.dispatchEvent(new BackgroundTaskEvent(taskPromise));

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

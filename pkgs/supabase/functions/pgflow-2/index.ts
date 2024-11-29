import handleInput, { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import completeStep from "../_pgflow/completeStep.ts";
import failStep from "../_pgflow/failStep.ts";
import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import startStepExecution from "../_pgflow/startStepExecution.ts";
import completeStepExecution from "../_pgflow/completeStepExecution.ts";
import failStepExecution from "../_pgflow/failStepExecution.ts";

const supabase = createServiceRoleClient();

export class BackgroundTaskEvent extends Event {
  readonly taskPromise: Promise<any>;
  readonly input: EdgeFnInput;

  constructor(taskPromise: Promise<any>, input: EdgeFnInput) {
    super("pgflow");
    this.taskPromise = taskPromise;
    this.input = input;
  }
}

async function performTask(input: EdgeFnInput) {
  const { meta, payload } = input;
  let stepResult: any;

  try {
    stepResult = await handleInput(meta, payload);
  } catch (error) {
    // const failStepResult = await failStep(meta, error, supabase);
    // return failStepResult;
  }

  const completeStepResult = await completeStep(meta, stepResult, supabase);
  return completeStepResult;
}

globalThis.addEventListener("pgflow", async (event) => {
  const { taskPromise, input } = event as BackgroundTaskEvent;

  try {
    await startStepExecution(input, supabase);
    await taskPromise;
    // await completeStepExecution(input, supabase);
  } catch (_error) {
    // await failStepExecution(input, supabase);
  }
});

Deno.serve(async (req: Request) => {
  const input: EdgeFnInput = await req.json();

  const taskPromise = performTask(input);

  globalThis.dispatchEvent(new BackgroundTaskEvent(taskPromise, input));

  return new Response(JSON.stringify("ok"), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});

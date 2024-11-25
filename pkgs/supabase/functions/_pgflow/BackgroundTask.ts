import { createServiceRoleClient } from "../_shared/supabaseClient.ts";
import { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import handleInput from "../_pgflow/handleInput.ts";
import completeStep from "../_pgflow/completeStep.ts";
import failStep from "../_pgflow/failStep.ts";

export class BackgroundTaskEvent extends Event {
  readonly input: EdgeFnInput;

  constructor(input: EdgeFnInput) {
    super("pgflow");
    this.input = input;
  }
}

export function setupBackgroundTaskListener(globalThis: any) {
  const supabase = createServiceRoleClient();

  globalThis.addEventListener("pgflow", async (event: BackgroundTaskEvent) => {
    const backgroundTask = event as BackgroundTaskEvent;
    const { meta, payload } = backgroundTask.input;
    console.log("Event Listener START", backgroundTask.input);

    try {
      const stepResult = await handleInput(meta, payload);
      console.log("Event Listener RESULT", stepResult);

      const completeStepResult = await completeStep(meta, stepResult, supabase);
      console.log("Event Listener COMPLETE", completeStepResult);

      return completeStepResult;
    } catch (error) {
      const failStepResult = await failStep(meta, error, supabase);
      console.log("Event Listener FAIL", error, failStepResult);

      return failStepResult;
    }
  });
}

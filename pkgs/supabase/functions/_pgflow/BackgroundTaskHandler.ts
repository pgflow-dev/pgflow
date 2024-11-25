import { Json } from "../_pgflow/Flow.ts";
import handleInput, { type EdgeFnInput } from "../_pgflow/handleInput.ts";
import completeStep from "../_pgflow/completeStep.ts";
import failStep from "../_pgflow/failStep.ts";
import { type SupabaseClient } from "@supabase/supabase-js";

type BackgroundTaskOptions = {
  meta: EdgeFnInput["meta"];
  payload: EdgeFnInput["payload"];
};

export default class BackgroundTaskHandler extends Event {
  readonly input: EdgeFnInput;
  readonly supabase: SupabaseClient;

  constructor(input: EdgeFnInput, supabase: SupabaseClient) {
    super("pgflow");
    this.input = input;
    this.supabase = supabase;
  }

  async handle() {
    try {
      const { meta, payload } = this.input;
      const stepResult = await handleInput(meta, payload);

      const completeStepResult = await completeStep(
        meta,
        stepResult,
        this.supabase,
      );

      return completeStepResult;
    } catch (error) {
      const failStepResult = await failStep(meta, error, this.supabase);

      return failStepResult;
    }
  }
}

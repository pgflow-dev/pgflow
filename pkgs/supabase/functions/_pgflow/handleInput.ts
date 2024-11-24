import type { Json } from "../../types.d.ts";
import ProcessVoiceMemo from "../_flows/ProcessVoiceMemo.ts";

export type EdgeFnInput = {
  meta: {
    run_id: string;
    flow_slug: string;
    step_slug: string;
  };
  payload: Json;
};

export default async function handleInput(
  { run_id, flow_slug, step_slug }: EdgeFnInput["meta"],
  payload: EdgeFnInput["payload"],
) {
  console.log(
    `CALLING HANDLER FOR ${flow_slug}/${step_slug} (run ${run_id}) with payload`,
    payload,
  );

  const flowSteps = ProcessVoiceMemo.getSteps();
  type StepNames = keyof typeof flowSteps;

  function assertStepSlug(slug: string): asserts slug is StepNames {
    if (!(slug in flowSteps)) {
      throw new Error(`Invalid step slug: ${String(slug)}`);
    }
  }
  assertStepSlug(step_slug);

  const stepToRun = flowSteps[step_slug];
  const stepHandler = stepToRun.handler;

  return await stepHandler(payload);
}

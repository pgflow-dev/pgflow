import type { Json } from "../../types.d.ts";
import FlowDefs from "../_flows/index.ts";

type FlowSlugs = keyof typeof FlowDefs;
type AllFlowDefs = (typeof FlowDefs)[FlowSlugs];

type FlowSteps<K extends FlowSlugs> = ReturnType<
  (typeof FlowDefs)[K]["getSteps"]
>;

type FlowToSteps<K extends FlowSlugs> = {
  flow_slug: K;
  step_slug: keyof FlowSteps<K>;
  // step_slug: keyof ReturnType<(typeof FlowDefs)[K]["getSteps"]>;
};

type AllFlowSteps = {
  [K in FlowSlugs]: FlowToSteps<K>;
}[FlowSlugs];

export type EdgeFnInput = {
  meta: {
    run_id: string;
  } & AllFlowSteps;
  payload: Json;
};

export default async function handleInput(
  { run_id, flow_slug, step_slug }: EdgeFnInput["meta"],
  payload: EdgeFnInput["payload"],
) {
  const FlowDef = FlowDefs[flow_slug];
  const flowSteps = FlowDef.getSteps();
  type StepNames = keyof typeof flowSteps;

  function assertStepSlug(slug: string): asserts slug is StepNames {
    if (!(slug in flowSteps)) {
      throw new Error(`Invalid step slug: ${String(slug)}`);
    }
  }
  assertStepSlug(step_slug);

  const stepToRun = flowSteps[step_slug];
  const stepHandler = stepToRun.handler;

  console.log(`CALL: ${flow_slug}/${step_slug} (${run_id})`, payload);
  const handlerResult = await stepHandler(payload);

  console.log(`RTRN: ${flow_slug}/${step_slug} (${run_id})`, handlerResult);

  return handlerResult;
}

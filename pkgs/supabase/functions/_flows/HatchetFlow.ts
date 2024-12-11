import { Flow } from "../_pgflow/Flow.ts";

type RunPayload = {
  docsIds: string[];
};

const HatchetFlow = new Flow<RunPayload>()
  .step("start", (_payload) => {
    return { status: "starting..." };
  })
  .step("load_docs", ["start"], ({ start: { status } }) => {
    return { status: `docs loaded`, docs: [`the start status was ${status}`] };
  })
  .step("reason_docs", ["load_docs"], ({ load_docs: { docs } }) => {
    return {
      status: "writing a response",
      research: `reasoning about ${docs.length} docs...`,
    };
  })
  .step(
    "generate_response",
    ["reason_docs"],
    ({ reason_docs: { research } }) => {
      return {
        status: "complete",
        message: `the reasoning was ${research}`,
      };
    },
  );

export default HatchetFlow;

export type StepsType = ReturnType<typeof HatchetFlow.getSteps>;

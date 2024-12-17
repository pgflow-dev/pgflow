import { Flow } from "../_pgflow/Flow.ts";
import { simulateWorkThenError } from "../_pgflow/utils.ts";

type RunPayload = {
  docsIds: string[];
};

const HatchetFlow = new Flow<RunPayload>()
  .step("start", async (_payload) => {
    await simulateWorkThenError();
    return { status: "starting..." };
  })
  .step("load_docs", ["start"], async ({ start: { status } }) => {
    await simulateWorkThenError();
    return { status: `docs loaded`, docs: [`the start status was ${status}`] };
  })
  .step("reason_docs", ["load_docs"], async ({ load_docs: { docs } }) => {
    await simulateWorkThenError();
    return {
      status: "writing a response",
      research: `reasoning about ${docs.length} docs...`,
    };
  })
  .step(
    "generate_response",
    ["reason_docs"],
    async ({ reason_docs: { research } }) => {
      await simulateWorkThenError();
      return {
        status: "complete",
        message: `the reasoning was ${research}`,
      };
    },
  );

export default HatchetFlow;

export type StepsType = ReturnType<typeof HatchetFlow.getSteps>;

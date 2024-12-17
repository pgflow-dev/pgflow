import { Flow } from "../_pgflow/Flow.ts";
import { simulateWorkThenError } from "../_pgflow/utils.ts";

const SequentialFlow = new Flow<string>()
  .step("s1", async ({ run }) => {
    await simulateWorkThenError();
    return `[${run}] step 1`;
  })
  .step("s2", ["s1"], async ({ s1: step1 }) => {
    await simulateWorkThenError();
    return `${step1} -> step 2`;
  })
  .step("s3", ["s2"], async ({ s2: step2 }) => {
    await simulateWorkThenError();
    return `${step2} -> step 3`;
  })
  .step("s4", ["s3"], async ({ s3: step3 }) => {
    await simulateWorkThenError();
    return `${step3} -> step 4`;
  })
  .step("s5", ["s4"], async ({ s4: step4 }) => {
    await simulateWorkThenError();
    return `${step4} -> step 5`;
  })
  .step("s6", ["s5"], async ({ s5: step5 }) => {
    await simulateWorkThenError();
    return `${step5} -> step 6`;
  })
  .step("s7", ["s6"], async ({ s6: step6 }) => {
    await simulateWorkThenError();
    return `${step6} -> step 7`;
  })
  .step("s8", ["s7"], async ({ s7: step7 }) => {
    await simulateWorkThenError();
    return `${step7} -> step 8`;
  })
  .step("s9", ["s8"], async ({ s8: step8 }) => {
    await simulateWorkThenError();
    return `${step8} -> step 9`;
  })
  .step("s10", ["s9"], async ({ s9: step9 }) => {
    await simulateWorkThenError();
    return `${step9} -> step 10`;
  });

export default SequentialFlow;

export type StepsType = ReturnType<typeof SequentialFlow.getSteps>;

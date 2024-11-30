import { Flow } from "../_pgflow/Flow.ts";
import { randomSleep } from "../_pgflow/utils.ts";

const SequentialFlow = new Flow<string>()
  .task("1", async ({ run }) => {
    await randomSleep();
    return `[${run}] step 1`;
  })
  .task("2", ["1"], async ({ "1": step1 }) => {
    await randomSleep();
    return `${step1} -> step 2`;
  })
  .task("3", ["2"], async ({ "2": step2 }) => {
    await randomSleep();
    return `${step2} -> step 3`;
  })
  .task("4", ["3"], async ({ "3": step3 }) => {
    await randomSleep();
    return `${step3} -> step 4`;
  })
  .task("5", ["4"], async ({ "4": step4 }) => {
    await randomSleep();
    return `${step4} -> step 5`;
  })
  .task("6", ["5"], async ({ "5": step5 }) => {
    await randomSleep();
    return `${step5} -> step 6`;
  })
  .task("7", ["6"], async ({ "6": step6 }) => {
    await randomSleep();
    return `${step6} -> step 7`;
  })
  .task("8", ["7"], async ({ "7": step7 }) => {
    await randomSleep();
    return `${step7} -> step 8`;
  })
  .task("9", ["8"], async ({ "8": step8 }) => {
    await randomSleep();
    return `${step8} -> step 9`;
  })
  .task("10", ["9"], async ({ "9": step9 }) => {
    await randomSleep();
    return `${step9} -> step 10`;
  });

export default SequentialFlow;

export type StepsType = ReturnType<typeof SequentialFlow.getSteps>;

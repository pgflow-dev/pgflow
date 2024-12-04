import { Flow } from "../_pgflow/Flow.ts";
import { randomSleep } from "../_pgflow/utils.ts";

const MonstrousFlow = new Flow<string>()
  .step("r", async ({ run }) => {
    await randomSleep();
    return `[${run}]root`;
  })
  .step("a1", ["r"], async ({ r }) => {
    await randomSleep();
    return `${r}/a1`;
  })
  .step("a2", ["a1"], async ({ a1 }) => {
    await randomSleep();
    return `${a1}/a2`;
  })
  .step("a3", ["a2"], async ({ a2 }) => {
    await randomSleep();
    return `${a2}/a3`;
  })
  .step("a4", ["a3"], async ({ a3 }) => {
    await randomSleep();
    return `${a3}/a4`;
  })
  .step("a5", ["a4"], async ({ a4 }) => {
    await randomSleep();
    return `${a4}/a5`;
  })
  .step("a6", ["a5"], async ({ a5 }) => {
    await randomSleep();
    return `${a5}/a6`;
  })
  .step("a7", ["a6"], async ({ a6 }) => {
    await randomSleep();
    return `${a6}/a7`;
  })
  .step("a8", ["a7"], async ({ a7 }) => {
    await randomSleep();
    return `${a7}/a8`;
  })
  .step("b1", ["r"], async ({ r }) => {
    await randomSleep();
    return `${r}/b1`;
  })
  .step("b2", ["b1"], async ({ b1 }) => {
    await randomSleep();
    return `${b1}/b2`;
  })
  .step("b3", ["b2"], async ({ b2 }) => {
    await randomSleep();
    return `${b2}/b3`;
  })
  .step("b4", ["b3"], async ({ b3 }) => {
    await randomSleep();
    return `${b3}/b4`;
  })
  .step("b5", ["b4"], async ({ b4 }) => {
    await randomSleep();
    return `${b4}/b5`;
  })
  .step("b6", ["b5"], async ({ b5 }) => {
    await randomSleep();
    return `${b5}/b6`;
  })
  .step("b7", ["b6"], async ({ b6 }) => {
    await randomSleep();
    return `${b6}/b7`;
  })
  .step("b8", ["b7"], async ({ b7 }) => {
    await randomSleep();
    return `${b7}/b8`;
  })
  // Repeat similar pattern for branches c through y
  .step(
    "z",
    ["a8", "b8" /* add all other final nodes like c8, d8, ..., y8 */],
    async ({ a8 }) => {
      await randomSleep();
      return `Final: ${a8}`;
    },
  );

export default MonstrousFlow;

export type StepsType = ReturnType<typeof MonstrousFlow.getSteps>;

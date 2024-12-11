import { Flow } from "../_pgflow/Flow.ts";
import { randomSleep } from "../_pgflow/utils.ts";

const BasicFlow = new Flow<string>()
  .step("root", async ({ run }) => {
    await randomSleep(500);
    return `[${run}]r00t`;
  })
  .step("left", ["root"], async ({ root: r }) => {
    await randomSleep(500);
    return `${r}/left`;
  })
  .step("right", ["root"], async ({ root: r }) => {
    await randomSleep(1000);
    throw new Error("Right failed");
    return `${r}/right`;
  })
  .step("end", ["left", "right"], async ({ left, right, run }) => {
    await randomSleep(500);
    return `<${left}> and <${right}> of (${run})`;
  });

export default BasicFlow;

export type StepsType = ReturnType<typeof BasicFlow.getSteps>;

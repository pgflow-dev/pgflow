import { Flow } from "../_pgflow/Flow.ts";
import { randomSleep } from "../_pgflow/utils.ts";

const BasicFlow = new Flow<string>()
  .task("root", async ({ run }) => {
    // await randomSleep();
    return `[${run}]r00t`;
  })
  .task("left", ["root"], async ({ root: r }) => {
    await randomSleep();
    return `${r}/left`;
  })
  .task("right", ["root"], async ({ root: r }) => {
    await randomSleep();
    return `${r}/right`;
  })
  .task("end", ["left", "right"], async ({ left, right, run }) => {
    await randomSleep();
    return `<${left}> and <${right}> of (${run})`;
  });

export default BasicFlow;

export type StepsType = ReturnType<typeof BasicFlow.getSteps>;

import { Flow } from "../_pgflow/Flow.ts";
import { simulateWorkThenError } from "../_pgflow/utils.ts";

const BasicFlow = new Flow<string>()
  .step("root", async ({ run }) => {
    await simulateWorkThenError();
    return `[${run}]r00t`;
  })
  .step("left", ["root"], async ({ root: r }) => {
    await simulateWorkThenError();
    return `${r}/left`;
  })
  .step("right", ["root"], async ({ root: r }) => {
    await simulateWorkThenError();
    return `${r}/right`;
  })
  .step("end", ["left", "right"], async ({ left, right, run }) => {
    await simulateWorkThenError();
    return `<${left}> and <${right}> of (${run})`;
  });

export default BasicFlow;

export type StepsType = ReturnType<typeof BasicFlow.getSteps>;

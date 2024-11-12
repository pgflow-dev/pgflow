import { Flow } from "./Flow.ts";

const BasicFlow = new Flow<string>()
  .addRootStep("root", (runPayload) => `[${runPayload}]r00t`)
  .addStep("left", ["root"], ({ root: r }) => `${r}/left`)
  .addStep("right", ["root"], ({ root: r }) => `${r}/right`)
  .addStep(
    "end",
    ["left", "right"],
    ({ left, right, __run__ }) => `<${left}> and <${right}> of (${__run__})`,
  );

export default BasicFlow;

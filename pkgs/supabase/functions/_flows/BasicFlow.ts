import { Flow } from "./Flow.ts";

const BasicFlow = new Flow<string>()
  .task("root", (runPayload) => `[${runPayload}]r00t`)
  .task("left", ["root"], ({ root: r }) => `${r}/left`)
  .task("right", ["root"], ({ root: r }) => `${r}/right`)
  .task(
    "end",
    ["left", "right"],
    ({ left, right, __run__ }) => `<${left}> and <${right}> of (${__run__})`,
  );

export default BasicFlow;

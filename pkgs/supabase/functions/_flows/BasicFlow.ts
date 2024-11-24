import { Flow } from "../_pgflow/Flow.ts";

const BasicFlow = new Flow<string>()
  .task("root", ({ run }) => `[${run}]r00t`)
  .task("left", ["root"], ({ root: r }) => `${r}/left`)
  .task("right", ["root"], ({ root: r }) => `${r}/right`)
  .task(
    "end",
    ["left", "right"],
    ({ left, right, run }) => `<${left}> and <${right}> of (${run})`,
  );

export default BasicFlow;

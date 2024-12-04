---
title: TypeScript API
---

Hey there! 👋 Let's talk about the TypeScript API - it's your friendly tool for building workflows that can run pretty much anywhere JavaScript runs (browsers, Node.js, Deno, you name it!).

### Type Safety - Your Safety Net 🛡️

Ever worried about passing the wrong data between different parts of your code? We've got you covered!

When you create a new flow using `Flow<YourDataType>`, TypeScript becomes your coding buddy that:

- Catches type errors before they happen
- Suggests the correct properties as you code
- Makes sure data flows correctly between steps

The cool part? You only need to define your input type once, and TypeScript automatically figures out all the types throughout your entire workflow. Plus, we automatically create JSON schemas behind the scenes to keep your database data just as safe. No more type-related surprises!

### Let's See It In Action

```js
import { Flow } from "pgflow";

const BasicFlow = new Flow<string>()
  .step("root", ({ run }) => `[${run}]r00t`)
  .step("left", ["root"], ({ root: r }) => `${r}/left`)
  .step("right", ["root"], ({ root: r }) => `${r}/right`)
  .step(
    "end",
    ["left", "right"],
    ({ left, right, run }) => `<${left}> and <${right}> of (${run})`,
  );


flow.addFlow({
  name: "my flow",
  steps: [
    {
      name: "step 1",
      run: async ({ ctx }) => {
        console.log("step 1 ctx", ctx);
      },
    },
  ],
});
```

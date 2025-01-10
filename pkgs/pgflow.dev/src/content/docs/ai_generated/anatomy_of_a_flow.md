---
title: An Anatomy of a Flow
draft: true
---

## Introduction to Flows

In the world of programming, a **Flow** represents a Directed Acyclic Graph (DAG) where each node is a step, and edges define dependencies between these steps. This structure ensures that steps are executed in a specific order, respecting their dependencies. The Flow DSL (Domain-Specific Language) provides a powerful way to define and manage these flows, leveraging TypeScript's type system to enhance safety and developer experience.

## Constructing a Flow

### Basic Concepts

1. **Tasks**: The fundamental units of work in a flow. Each step can have dependencies, which are other steps that must complete before it can start.
2. **Dependencies**: Define the order of execution. A step will only execute once all its dependencies have completed.
3. **Payload**: Data passed through the flow, which can be transformed or enriched by each step.

### Flow DSL

The Flow DSL allows you to define steps and their dependencies using a fluent API. Here's a breakdown of how to construct a flow:

```typescript
import { Flow } from "./Flow.ts";

const BasicFlow = new Flow<string>()
  .step("root", ({ run }) => `[${run}]r00t`)
  .step("left", ["root"], ({ root: r }) => `${r}/left`)
  .step("right", ["root"], ({ root: r }) => `${r}/right`)
  .step(
    "end",
    ["left", "right"],
    ({ left, right, run }) => `<${left}> and <${right}> of (${run})`,
  );
```

### Leveraging TypeScript

The Flow DSL provides type hints that guide you in defining steps and their dependencies. This ensures that your flow is correctly structured and that data passed between steps is type-safe. Always leverage these type hints to simplify development and reduce errors.

## Sequence Diagram

Below is a sequence diagram illustrating the execution of `BasicFlow`:

```mermaid
sequenceDiagram
    participant Run
    participant Root as Task: root
    participant Left as Task: left
    participant Right as Task: right
    participant End as Task: end

    Run->>Root: Start
    Root-->>Run: Complete
    Run->>Left: Start
    Run->>Right: Start
    Left-->>Run: Complete
    Right-->>Run: Complete
    Run->>End: Start
    End-->>Run: Complete
```

## Execution Process

1. **Initialization**: The flow is initialized with a payload.
2. **Root Task Execution**: The root step starts first as it has no dependencies.
3. **Dependent Tasks**: Once the root step completes, dependent steps (`left` and `right`) start concurrently.
4. **Final Task**: The `end` step starts only after both `left` and `right` steps have completed.

## Conclusion

Flows provide a structured way to manage complex step dependencies, ensuring steps are executed in the correct order. By using the Flow DSL and TypeScript's type system, you can create robust and maintainable flows with ease. Always utilize the type hints provided by the DSL to enhance your development experience.

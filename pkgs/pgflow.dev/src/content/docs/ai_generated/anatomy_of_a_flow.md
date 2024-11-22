---
title: An Anatomy of a Flow
---

## Introduction to Flows

In the world of programming, a **Flow** represents a Directed Acyclic Graph (DAG) where each node is a task, and edges define dependencies between these tasks. This structure ensures that tasks are executed in a specific order, respecting their dependencies. The Flow DSL (Domain-Specific Language) provides a powerful way to define and manage these flows, leveraging TypeScript's type system to enhance safety and developer experience.

## Constructing a Flow

### Basic Concepts

1. **Tasks**: The fundamental units of work in a flow. Each task can have dependencies, which are other tasks that must complete before it can start.
2. **Dependencies**: Define the order of execution. A task will only execute once all its dependencies have completed.
3. **Payload**: Data passed through the flow, which can be transformed or enriched by each task.

### Flow DSL

The Flow DSL allows you to define tasks and their dependencies using a fluent API. Here's a breakdown of how to construct a flow:

```typescript
import { Flow } from "./Flow.ts";

const BasicFlow = new Flow<string>()
  .task("root", ({ run }) => `[${run}]r00t`)
  .task("left", ["root"], ({ root: r }) => `${r}/left`)
  .task("right", ["root"], ({ root: r }) => `${r}/right`)
  .task(
    "end",
    ["left", "right"],
    ({ left, right, run }) => `<${left}> and <${right}> of (${run})`,
  );
```

### Leveraging TypeScript

The Flow DSL provides type hints that guide you in defining tasks and their dependencies. This ensures that your flow is correctly structured and that data passed between tasks is type-safe. Always leverage these type hints to simplify development and reduce errors.

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
2. **Root Task Execution**: The root task starts first as it has no dependencies.
3. **Dependent Tasks**: Once the root task completes, dependent tasks (`left` and `right`) start concurrently.
4. **Final Task**: The `end` task starts only after both `left` and `right` tasks have completed.

## Conclusion

Flows provide a structured way to manage complex task dependencies, ensuring tasks are executed in the correct order. By using the Flow DSL and TypeScript's type system, you can create robust and maintainable flows with ease. Always utilize the type hints provided by the DSL to enhance your development experience.

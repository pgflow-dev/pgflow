# Evaluating a Fanout Implementation for Subflows

This document explores a minimal and developer-friendly way to introduce **fanout** capabilities into our Flow DSL when using subflows. The goal is to let a single step or subflow depend on an array output and process each array element in parallel, while maintaining simple code, good engineering practices, and a clear developer experience.

---

## 1. Overview

We want to allow:

```ts
.subflow(
  {
    slug: "subflow_slug",
    runIf: {},           // Optional condition
    dependsOn: ["array"],
    fanout: true,
  },
  SubflowClass
)
```

Key points:

- **`dependsOn: ["array"]`** must point to a step that returns an **array**.
- **`fanout: true`** signals that we should _parallelize_ execution for each element in that array.
- Each “fanout item” in the subflow receives the standard `.run` input as well.

We propose a design that stays consistent with existing DSL conventions, uses straightforward code, and keeps complexity low.

---

## 2. DSL Additions

### 2.1 `.subflow()` Declaration

- A subflow is declared similarly to a normal step but with `fanout: true`.
- We constrain fanout subflows to **only one** dependency, which must return an array.
- Internally, we interpret that single dependency’s output as the items to fan out over.

```ts
flow.subflow(
  {
    slug: 'handleProductItems',
    dependsOn: ['fetchProducts'],
    fanout: true, // triggers parallel execution for each fetched product
  },
  ProductHandlerSubflow
);
```

**How `dependsOn` works with subflows:**  
When you specify `dependsOn` for a subflow, these dependencies are automatically appended to the root steps of the subflow. This ensures that all steps within the subflow have access to the same set of dependencies, enforcing type safety throughout the Flow. The subflow's root steps inherit these dependencies, maintaining a consistent type chain from the parent flow to the subflow.

**Why only one dependency?**  
When fanout is enabled, we want to avoid confusion about which step’s output is the array. This keeps the mental model simple.

### 2.2 Subflow Specification Options

There are two ways to specify a subflow:

1. **Direct SubflowClass Reference**:

   ```ts
   .subflow(
     {
       slug: 'processItems',
       dependsOn: ['fetchItems'],
       fanout: true,
     },
     ProductHandlerSubflow // Direct class reference
   )
   ```

   When using this approach, the `SubflowClass` must match the expected input types from `dependsOn` and the parent flow's `run` input. Type safety is enforced throughout the chain.

2. **Handler Function**:
   ```ts
   .subflow(
     {
       slug: 'processItems',
       dependsOn: ['fetchItems'],
       fanout: true,
     },
     (input) => {
       // Transform input before passing to subflow
       return new CustomSubflow(input);
     }
   )
   ```
   When using a handler function, an additional task is spawned for resolving the subflow step input to the given flow inputs. This provides flexibility for transforming or adapting inputs before they reach the subflow.

### 2.3 Handler Input

Inside the subflow’s steps, each handler sees:

- `run` (the primary payload for the entire flow)
- The subflow-level “fanout item” from `fetchProducts`

Under the hood, the subflow logic clones itself per array element, injecting each element into the subflow’s steps. The minimal code approach might look like:

```ts
class ProductHandlerSubflow extends FlowSubflow<{
  run: GlobalInput;
  item: Product;
}> {
  constructor() {
    super('product_handler_subflow');

    this.step({ slug: 'processEachProduct' }, async (input) => {
      // input.run => the global run payload
      // input.item => the array element from fetchProducts
      // ...
    });
  }
}
```

All normal features—like `runIf` checks inside subflow steps—remain valid, but each item is processed independently.

---

## 3. Execution Model

1. **Source Step**: A step named `"fetchProducts"` returns an array of items.
2. **Fanout Subflow**: Because `fanout: true` is set, the flow engine spawns multiple subflow “instances” (or parallel tasks)—one for each array element.
3. **Parallel Steps**: Each subflow instance runs its internal steps in sequence (or partial parallel, if so defined).
4. **Aggregate**: Once every parallel subflow finishes, the parent flow can access aggregated outputs, or we can mark the subflow as “complete” with references to each item’s results.

By default, we can store intermediate results from each subflow run in an array or merged object, depending on the subflow’s final return.

---

## 4. Suggested Conventions for Simplicity

1. **One Dependency**: We enforce that only one step can be the array-producer, so code is less ambiguous (e.g. no confusion about which array to fan out over).
2. **Stable Subflow Slug**: A subflow root has a single slug, but internally, the engine appends some index for each array item at runtime. This keeps definitions short while letting the engine isolate each parallel item.
3. **All-or-Nothing Condition**: If the subflow root has `runIf` or `runUnless`, that condition is evaluated _before_ the fanout. If it fails, the entire subflow is skipped. (We can add more granular filtering in a future iteration if needed.)
4. **No Extra Configuration**: Let `fanout: true` simply do the parallelization. If advanced concurrency or filtering is needed, we may add optional fields later.

---

## 5. Developer Experience & Engineering Benefits

- **Low Code, High Clarity**  
  Developers only set `fanout: true` and ensure the dependency returns an array. No heavy type gymnastics or advanced config.

- **Convention Over Configuration**  
  By limiting `fanout` subflows to one dependency, we avoid confusion. This enforces a predictable pattern: “One array step -> one subflow fanout.”

- **Minimal Changes in the Schema**  
  Internally, we can slightly extend the existing subflow or step records to store `fanout: boolean`. No large structural or migration burden.

- **Great Testability**  
  Each subflow’s steps remain individually testable by passing in a single “item” payload. The parallel fanout is just repeated logic.

- **Future Expansion**  
  We can add advanced features (like concurrency limits, item-level filtering, partial skipping) without breaking the basic approach.

---

## 6. Example

Below is a minimal pseudo-flow to illustrate how fanout subflows might look:

```ts
import { Flow, type Json } from './dsl';

type GlobalInput = { userId: number };

const MyFlow = new Flow<GlobalInput>({ slug: 'my_main_flow' })
  .step({ slug: 'fetchProducts' }, async (input) => {
    // returns an array of items
    return [
      { id: 1, name: 'Phone' },
      { id: 2, name: 'Laptop' },
    ];
  })
  .subflow(
    {
      slug: 'processEachItem',
      dependsOn: ['fetchProducts'],
      fanout: true, // each item from fetchProducts is handled
    },
    class extends Flow<{ item: { id: number; name: string } }> {
      constructor() {
        super({ slug: 'product_subflow' });
        this.step({ slug: 'logItem' }, (input) => {
          console.log('Item for user', input.run.userId, input.item);
          return { processed: true };
        });
      }
    }
  )
  .step(
    { slug: 'finalSummary', dependsOn: ['fetchProducts', 'processEachItem'] },
    (input) => {
      return {
        totalItems: input.fetchProducts.length,
        // Optionally gather subflow results if each item returned a value
      };
    }
  );

export default MyFlow;
```

**Explanation**:

- `fetchProducts` → returns an array `[Phone, Laptop]`.
- `processEachItem` → fans out over each product. `input.item` is set in each parallel subflow instance.
- `finalSummary` → waits for _both_ the fetch step and the subflow to finish, then merges any results.

---

## 7. Conclusion

Using `fanout: true` on a subflow (or step) with a single array dependency gives us:

1. **A straightforward mental model**: one array in, multiple parallel tasks out.
2. **Minimal changes** to existing DSL or database schema.
3. **Clarity for developers** via explicit typing and an easy `.subflow()` call.
4. **Scalability** as each element is processed independently, letting the engine or an external worker handle more concurrency.

This approach embraces “convention over configuration” and keeps the codebase lean while still delivering a powerful new feature for parallel data processing. Future expansions—like partial skipping, concurrency caps, or item-level conditions—can be layered on top of the simple fanout mechanism described here without breaking its basic usage pattern.

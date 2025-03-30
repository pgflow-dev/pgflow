# The `.branch()` Method in Flow Syntax

## Description

The `.branch()` method allows you to define a conditional branch within your flow. This syntax provides better readability for conditional execution paths and explicitly groups related steps together.

## Syntax

```typescript
.branch(
  {
    slug: string,
    dependsOn?: string[],
    runIf?: StepCondition,
    runUnless?: StepCondition
  },
  (flow) => flow.step(...).step(...)...
)
```

## Behavior

When a `.branch()` is used, the system:

1. Takes all steps defined within the branch callback
2. Automatically prefixes their slugs with the branch slug
3. Adds all these steps inline to the current flow (they're not in a separate flow)
4. Applies the same conditional execution criteria (`runIf` or `runUnless`) to all steps in the branch

## Example

```typescript
new Flow<string>({ slug: 'analyzeWebsite' })
  .step({ slug: 'website' }, async ({ run }) => await fetchData(run.url))
  .branch(
    {
      slug: 'ifSuccess',
      dependsOn: ['website'],
      runIf: { website: { status: 200 } },
    },
    (flow) =>
      flow
        .step({ slug: 'sentiment' }, async ({ run, website }) => /* ... */)
        .step({ slug: 'summary' }, async ({ run, website }) => /* ... */)
  )
```

In this example:
- The actual step slugs become `ifSuccess.sentiment` and `ifSuccess.summary`
- Both steps have the same `runIf` condition inherited from the branch definition
- Both steps are added directly to the main flow, not to a sub-flow

This makes it easier to visualize which steps will run together under specific conditions while maintaining all steps within a single flow definition.

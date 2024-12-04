# Prompt to create Flow type

I am working on a DSL for workflow engine that runs on top of Postgres.
Workflows are DAGs of steps, value returned by one step is passed to its dependencies.
Workflow is executed and forms a "run".
When executing workflow, one passes a payload, which is saved as run payload
and passed directly to the root steps, which are steps that have no dependencies.

Any steps that have dependencies will be called with an object composed
of all the dependencies return values, where dependency name will be a key
and the return value will be a value.

I want to create a generic (template?) typescript type "Workflow" which
will accept a RunPayload as its template variable. RunPayload is a custom
type that user writes.

I want the type for the object to be such that when i pass a RunPayload as a template
type to Workflow, like this: Workflow<RunPayload>, it will be used to type
the root step handlers automatically (in our case, the "run()" method from the transcribe step).

Root steps are steps that does not have dependsOn property or have it set as empty array, null or undefined;

Other steps are steps that has dependsOn property and it's not empty array, null or undefined.
They will run only after all steps that are listed in dependsOn complete.
The names of the steps corresponds to the strings in dependsOn array.
Name of the steps are top level keys in the Flow type.

The steps that have depencencies will be called with an object composed of all the dependencies return values.
There will also be included an additional special key "run" which will hold the RunPayload itself,
so each step can also refer to run payload.

So in our case of step "summarize", it depends on "transcribe", so it is called with an object of type:

```typescript
type SummarizePayload = {
	run: RunPayload,
	transcribe: <type of return value of "transcribe">
}
```

The type includes only run key and any direct dependencies, no all parent steps.

## Your job

Your job is to create a Flow<T> type such that T is the run payload of the flow,
and is used to build the types for root steps, and the outputs from the steps
used to build composed dependency types for the non-root steps.

## IMPORTANT!!!

Make sure you understand that the shape of the type should be Flow<T>

- all the return types of the steps should be inferred from the return types of
  the run methods themselvves.

We just need to create a type for a DAG graph of steps and connect their inputs and outputs with types,
assuming the bodies of run() will be using typed code and the return
type of the function run() will always be known this way.

## Example usage

Use this example usage of the Flow<T> type so you can better understand
and use references i mentioned:

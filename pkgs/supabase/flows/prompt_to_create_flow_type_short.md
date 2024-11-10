# Prompt to create Flow type

I am working on a DSL for workflow engine that runs on top of Postgres.
Flows are DAGs of steps, value returned by one step is passed to its dependencies.
Flow is executed and forms a "run".
When executing workflow, one passes a payload, which is saved as run payload
and passed directly to the root steps, which are steps that have no dependencies.

Any steps that have dependencies will be called with an object composed
of all the dependencies return values, where dependency name will be a key
and the return value will be a value.

I want to create a generic (template?) typescript type "Flow" which 
will accept a RunPayload as its template variable. RunPayload is a custom
type that user writes.

I want the type for the object to be such that when i pass a RunPayload as a template
type to Flow, like this: Flow<RunPayload>, it will be used to type
the root step handlers automatically (in our case, the "run()" method from the transcribe step).

Root steps are steps that does not have any dependencies.

Other steps are steps that have dependencies.
They will run only after all steps that are their dependencies successfully complete.

I want you to model such a DSL in TypeScript that will provide maximum type safety
inside the bodies of the step handler functions and will require absolute
minimal type annotations - preferably the only required type annotation 
is the RunPayload type.

I want the signatures for non-rooot steps (ones with dependencies)
to be an object composed of all the dependencies return values - name of the dependency
will be a key and return value of it will be a value. 
There will also be included an additional special key "__run__" which will hold the RunPayload itself.

For root steps, the object passed to the handlers will be just RunPayload.

so each step can also refer to run payload.

So, if we have a Flow with following run payload:

```typescript
type RunPayload = {
	voiceMemoId: string
}
```
and a root step "transcribe" which returns following type:

```typescript
type TranscribeOutput = {
	trancription: string
}
```

and a "summarize" step that depends on "transcribe", having following type: 

```typescript
type SummarizePayload = {
	__run__: RunPayload,
	transcribe: TranscribeOutput
}
```


The type includes only __run__ key and any direct dependencies, no all parent steps.


## IMPORTANT!!!

Make sure you understand that we prefer to only type annotate run payload and
have everything else inferred.

## Remember about TypeScript limitations!!!

Unfortunately, due to the limitations of TypeScript's type inference for generic functions, it's not possible  to have a function where you provide one type argument (like T) and have subsequent generic parameters (Steps) inferred from the function arguments. TypeScript requires that if any generic type parameters are specified, they must be provided in order, and any subsequent generic type parameters cannot be inferred. 
 
### Why Can't TypeScript Infer Steps When T Is Provided? 

TypeScript's Generic Parameter Inference Rules : When you call a generic function and provide explicit type arguments, TypeScript expects all preceding type parameters to be specified. It cannot infer later parameters if earlier ones are specified. 
